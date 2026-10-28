"""Builds packs/RP from the b1.7.3 jar assets (re/assets, extracted from b173.jar).

Block and item icons are cut from terrain.png / gui/items.png at the indices the b1.7.3 Block and Item classes
use; the animated textures (water, lava, fire, portal, compass, clock) are produced by Python ports of the
game's TextureFX classes; the rest are copied or re-laid-out for Bedrock's file names.
"""
import json
import math
import os
import random
import shutil
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import png  # noqa: E402
import tga  # noqa: E402
from png import Image  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 're', 'assets')
RP = os.path.join(ROOT, 'packs', 'RP')
TEX = os.path.join(RP, 'textures')


def fround(x):
    return struct.unpack('f', struct.pack('f', x))[0]


def out(rel):
    p = os.path.join(TEX, *rel.split('/'))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def tile(atlas, i, n=1):
    return atlas.crop((i % 16) * 16, (i // 16) * 16, 16 * n, 16 * n)


def tint(img, rgb):
    o = Image(img.w, img.h)
    for y in range(img.h):
        for x in range(img.w):
            r, g, b, a = img.get(x, y)
            o.set(x, y, (r * rgb[0] // 255, g * rgb[1] // 255, b * rgb[2] // 255, a))
    return o


def opaque(img):
    o = Image(img.w, img.h, bytearray(img.data))
    for i in range(3, len(o.data), 4):
        o.data[i] = 255
    return o


# ---------------------------------------------------------------- block textures (terrain.png index -> files)
BLOCKS = {
    0: ['blocks/grass_top'], 1: ['blocks/stone'], 2: ['blocks/dirt'], 4: ['blocks/planks_oak'],
    5: ['blocks/stone_slab_side'], 6: ['blocks/stone_slab_top'], 7: ['blocks/brick'], 8: ['blocks/tnt_side'],
    9: ['blocks/tnt_top'], 10: ['blocks/tnt_bottom'], 11: ['blocks/web'], 12: ['blocks/flower_rose'],
    13: ['blocks/flower_dandelion'], 15: ['blocks/sapling_oak'],
    16: ['blocks/cobblestone'], 17: ['blocks/bedrock'], 18: ['blocks/sand'], 19: ['blocks/gravel'],
    20: ['blocks/log_oak'], 21: ['blocks/log_oak_top', 'blocks/log_spruce_top', 'blocks/log_birch_top'],
    22: ['blocks/iron_block'], 23: ['blocks/gold_block'], 24: ['blocks/diamond_block'], 25: ['blocks/chest_top'],
    26: ['blocks/chest_side'], 27: ['blocks/chest_front'], 28: ['blocks/mushroom_red'], 29: ['blocks/mushroom_brown'],
    32: ['blocks/gold_ore'], 33: ['blocks/iron_ore'], 34: ['blocks/coal_ore'], 35: ['blocks/bookshelf'],
    36: ['blocks/cobblestone_mossy'], 37: ['blocks/obsidian'], 43: ['blocks/crafting_table_top'],
    44: ['blocks/furnace_front_off'], 45: ['blocks/furnace_side', 'blocks/dispenser_side'],
    46: ['blocks/dispenser_front_horizontal'],
    48: ['blocks/sponge'], 49: ['blocks/glass'], 50: ['blocks/diamond_ore'], 51: ['blocks/redstone_ore'],
    53: ['blocks/leaves_oak_opaque', 'blocks/leaves_birch_opaque'], 55: ['blocks/deadbush'],
    59: ['blocks/crafting_table_side'], 60: ['blocks/crafting_table_front'], 61: ['blocks/furnace_front_on'],
    62: ['blocks/furnace_top', 'blocks/dispenser_top'], 63: ['blocks/sapling_spruce'],
    64: ['blocks/wool_colored_white'], 65: ['blocks/mob_spawner'], 66: ['blocks/snow'], 67: ['blocks/ice'],
    72: ['blocks/clay'], 74: ['blocks/jukebox_side', 'blocks/noteblock'], 75: ['blocks/jukebox_top'],
    79: ['blocks/sapling_birch'],
    80: ['blocks/torch_on'], 81: ['blocks/door_wood_upper'], 82: ['blocks/door_iron_upper'], 83: ['blocks/ladder'],
    84: ['blocks/trapdoor'], 86: ['blocks/farmland_wet'], 87: ['blocks/farmland_dry'],
    96: ['blocks/lever'], 97: ['blocks/door_wood_lower'], 98: ['blocks/door_iron_lower'],
    99: ['blocks/redstone_torch_on'], 102: ['blocks/pumpkin_top'], 103: ['blocks/netherrack'],
    104: ['blocks/soul_sand'], 105: ['blocks/glowstone'], 106: ['blocks/piston_top_sticky'],
    107: ['blocks/piston_top_normal'], 108: ['blocks/piston_side'], 109: ['blocks/piston_bottom'],
    110: ['blocks/piston_inner'],
    112: ['blocks/rail_normal_turned'], 113: ['blocks/wool_colored_black'], 114: ['blocks/wool_colored_gray'],
    115: ['blocks/redstone_torch_off'], 116: ['blocks/log_spruce'], 117: ['blocks/log_birch'],
    118: ['blocks/pumpkin_side'], 119: ['blocks/pumpkin_face_off'], 120: ['blocks/pumpkin_face_on'],
    121: ['blocks/cake_top'], 122: ['blocks/cake_side'], 123: ['blocks/cake_inner'], 124: ['blocks/cake_bottom'],
    128: ['blocks/rail_normal'], 129: ['blocks/wool_colored_red'], 130: ['blocks/wool_colored_pink'],
    131: ['blocks/repeater_off'], 133: ['blocks/leaves_spruce_opaque'],
    134: ['blocks/bed_feet_top'], 135: ['blocks/bed_head_top'],
    144: ['blocks/lapis_block'], 145: ['blocks/wool_colored_green'], 146: ['blocks/wool_colored_lime'],
    147: ['blocks/repeater_on'], 149: ['blocks/bed_feet_end'], 150: ['blocks/bed_feet_side'],
    151: ['blocks/bed_head_side'], 152: ['blocks/bed_head_end'],
    160: ['blocks/lapis_ore'], 161: ['blocks/wool_colored_brown'], 162: ['blocks/wool_colored_yellow'],
    163: ['blocks/rail_golden'], 164: ['blocks/redstone_dust_cross'], 165: ['blocks/redstone_dust_line'],
    176: ['blocks/sandstone_top'], 177: ['blocks/wool_colored_blue'], 178: ['blocks/wool_colored_light_blue'],
    179: ['blocks/rail_golden_powered'],
    192: ['blocks/sandstone_normal'], 193: ['blocks/wool_colored_purple'], 194: ['blocks/wool_colored_magenta'],
    195: ['blocks/rail_detector', 'blocks/rail_detector_powered'],
    208: ['blocks/sandstone_bottom'], 209: ['blocks/wool_colored_cyan'], 210: ['blocks/wool_colored_orange'],
    225: ['blocks/wool_colored_silver'],
}
# alpha-cutout, biome-tinted textures Bedrock keeps as TGA (alpha 0 = hole)
BLOCK_TGA = {
    52: ['blocks/leaves_oak', 'blocks/leaves_birch'], 132: ['blocks/leaves_spruce'],
    39: ['blocks/tallgrass'], 56: ['blocks/fern'], 73: ['blocks/reeds'],
    69: ['blocks/cactus_top'], 70: ['blocks/cactus_side'], 71: ['blocks/cactus_bottom'],
}
WHEAT = 88


# ---------------------------------------------------------------- items (gui/items.png (column, row) from Item.<clinit>)
ITEMS = {
    (2, 5): 'iron_shovel', (2, 6): 'iron_pickaxe', (2, 7): 'iron_axe', (5, 0): 'flint_and_steel', (10, 0): 'apple',
    (5, 1): 'bow_standby', (5, 2): 'arrow', (7, 0): 'coal', (7, 3): 'diamond', (7, 1): 'iron_ingot',
    (7, 2): 'gold_ingot', (2, 4): 'iron_sword', (0, 4): 'wood_sword', (0, 5): 'wood_shovel', (0, 6): 'wood_pickaxe',
    (0, 7): 'wood_axe', (1, 4): 'stone_sword', (1, 5): 'stone_shovel', (1, 6): 'stone_pickaxe', (1, 7): 'stone_axe',
    (3, 4): 'diamond_sword', (3, 5): 'diamond_shovel', (3, 6): 'diamond_pickaxe', (3, 7): 'diamond_axe',
    (5, 3): 'stick', (7, 4): 'bowl', (8, 4): 'mushroom_stew', (4, 4): 'gold_sword', (4, 5): 'gold_shovel',
    (4, 6): 'gold_pickaxe', (4, 7): 'gold_axe', (8, 0): 'string', (8, 1): 'feather', (8, 2): 'gunpowder',
    (0, 8): 'wood_hoe', (1, 8): 'stone_hoe', (2, 8): 'iron_hoe', (3, 8): 'diamond_hoe', (4, 8): 'gold_hoe',
    (9, 0): 'seeds_wheat', (9, 1): 'wheat', (9, 2): 'bread',
    (1, 0): 'chainmail_helmet', (1, 1): 'chainmail_chestplate', (1, 2): 'chainmail_leggings', (1, 3): 'chainmail_boots',
    (2, 0): 'iron_helmet', (2, 1): 'iron_chestplate', (2, 2): 'iron_leggings', (2, 3): 'iron_boots',
    (3, 0): 'diamond_helmet', (3, 1): 'diamond_chestplate', (3, 2): 'diamond_leggings', (3, 3): 'diamond_boots',
    (4, 0): 'gold_helmet', (4, 1): 'gold_chestplate', (4, 2): 'gold_leggings', (4, 3): 'gold_boots',
    (6, 0): 'flint', (7, 5): 'porkchop_raw', (8, 5): 'porkchop_cooked', (10, 1): 'painting',
    (11, 0): 'apple_golden', (10, 2): 'sign', (11, 2): 'door_wood', (10, 4): 'bucket_empty', (11, 4): 'bucket_water',
    (12, 4): 'bucket_lava', (7, 8): 'minecart_normal', (8, 6): 'saddle', (12, 2): 'door_iron', (8, 3): 'redstone_dust',
    (14, 0): 'snowball', (8, 8): ['boat', 'boat_oak'], (7, 6): 'leather', (13, 4): 'bucket_milk', (6, 1): 'brick',
    (9, 3): 'clay_ball', (11, 1): 'reeds', (10, 3): 'paper', (11, 3): 'book_normal', (14, 1): 'slimeball',
    (7, 9): 'minecart_chest', (7, 10): 'minecart_furnace', (12, 0): 'egg', (6, 3): 'compass_item',
    (5, 4): 'fishing_rod_uncast', (6, 4): 'clock_item', (9, 4): 'glowstone_dust', (9, 5): 'fish_raw',
    (10, 5): 'fish_cooked', (12, 1): 'bone', (13, 0): 'sugar', (13, 1): 'cake', (13, 2): ['bed_red'],
    (6, 5): 'repeater', (12, 5): 'cookie', (12, 3): ['map_empty', 'map_filled'], (13, 5): 'shears',
    (0, 15): 'record_13', (1, 15): 'record_cat',
}
LEATHER = {(0, 0): 'leather_helmet', (0, 1): 'leather_chestplate', (0, 2): 'leather_leggings', (0, 3): 'leather_boots'}
# ItemDye icon = (14, 4) + (meta % 8) rows, + meta / 8 columns
DYES = ['black', 'red', 'green', 'brown', 'blue', 'purple', 'cyan', 'silver', 'gray', 'pink', 'lime', 'yellow',
        'light_blue', 'magenta', 'orange', 'white']


def colormap_color(cm, temp, hum):
    hum *= temp
    i = int((1.0 - temp) * 255.0)
    j = int((1.0 - hum) * 255.0)
    r, g, b, _ = cm.get(i, j)
    return (r, g, b)


# ---------------------------------------------------------------- TextureFX ports (b1.7.3 classes vs, oh, cg, if, sd, hs)
def loop_frames(frames, n, k):
    """n frames looping seamlessly: the first k are cross-faded with the frames that follow frame n-1."""
    outf = []
    for j in range(n):
        f = frames[j]
        if j < k:
            g = frames[n + j]
            t = j / k
            f = bytes(int(g[i] * (1 - t) + f[i] * t + 0.5) for i in range(len(f)))
        outf.append(f)
    return outf


def water_fx(flow, steps, rnd):
    g = [0.0] * 256
    h = [0.0] * 256
    ii = [0.0] * 256
    jj = [0.0] * 256
    k = 0
    frames = []
    for _ in range(steps):
        k += 1
        for x in range(16):
            for y in range(16):
                s = 0.0
                if flow:
                    for d in range(y - 2, y + 1):
                        s += g[(x & 15) + (d & 15) * 16]
                    h[x + y * 16] = fround(fround(s / fround(3.2)) + fround(ii[x + y * 16] * fround(0.8)))
                else:
                    for d in range(x - 1, x + 2):
                        s += g[(d & 15) + (y & 15) * 16]
                    h[x + y * 16] = fround(fround(s / fround(3.3)) + fround(ii[x + y * 16] * fround(0.8)))
        for x in range(16):
            for y in range(16):
                i = x + y * 16
                ii[i] = fround(ii[i] + fround(jj[i] * fround(0.05)))
                if ii[i] < 0:
                    ii[i] = 0.0
                jj[i] = fround(jj[i] - fround(0.3 if flow else 0.1))
                if rnd.random() < (0.2 if flow else 0.05):
                    jj[i] = 0.5
        g, h = h, g
        px = bytearray(1024)
        for i in range(256):
            f = g[(i - k * 16) & 255] if flow else g[i]
            f = min(1.0, max(0.0, f))
            f2 = fround(f * f)
            px[i * 4] = int(32.0 + f2 * 32.0) & 255
            px[i * 4 + 1] = int(50.0 + f2 * 64.0) & 255
            px[i * 4 + 2] = 255
            px[i * 4 + 3] = int(146.0 + f2 * 50.0) & 255
        frames.append(bytes(px))
    return frames


SIN_TABLE = [fround(math.sin(i * 3.141592653589793 * 2.0 / 65536.0)) for i in range(65536)]


def mh_sin(f):
    return SIN_TABLE[int(fround(f * fround(10430.378))) & 65535]


def lava_fx(flow, steps, rnd):
    g = [0.0] * 256
    h = [0.0] * 256
    ii = [0.0] * 256
    jj = [0.0] * 256
    k = 0
    frames = []
    pi2 = fround(fround(3.1415927) * 2.0)
    for _ in range(steps):
        k += 1
        for x in range(16):
            for y in range(16):
                s = 0.0
                a = int(fround(mh_sin(fround(fround(y * pi2) / 16.0)) * fround(1.2)))
                b = int(fround(mh_sin(fround(fround(x * pi2) / 16.0)) * fround(1.2)))
                for dx in range(x - 1, x + 2):
                    for dy in range(y - 1, y + 2):
                        s += g[((dx + a) & 15) + ((dy + b) & 15) * 16]
                avg = (ii[(x & 15) + (y & 15) * 16] + ii[((x + 1) & 15) + (y & 15) * 16] +
                       ii[((x + 1) & 15) + ((y + 1) & 15) * 16] + ii[(x & 15) + ((y + 1) & 15) * 16]) / 4.0
                h[x + y * 16] = fround(s / 10.0 + avg * 0.8)
                i = x + y * 16
                ii[i] = fround(ii[i] + fround(jj[i] * fround(0.01)))
                if ii[i] < 0:
                    ii[i] = 0.0
                jj[i] = fround(jj[i] - fround(0.06))
                if rnd.random() < 0.005:
                    jj[i] = 1.5
        g, h = h, g
        px = bytearray(1024)
        for i in range(256):
            f = g[(i - (k // 3) * 16) & 255] if flow else g[i]
            f = min(1.0, max(0.0, fround(f * 2.0)))
            px[i * 4] = int(f * 100.0 + 155.0) & 255
            px[i * 4 + 1] = int(f * f * 255.0) & 255
            px[i * 4 + 2] = int(f * f * f * f * 128.0) & 255
            px[i * 4 + 3] = 255
        frames.append(bytes(px))
    return frames


def fire_fx(steps, rnd):
    g = [0.0] * 320
    h = [0.0] * 320
    frames = []
    for _ in range(steps):
        for x in range(16):
            for y in range(20):
                n = 18
                f = fround(g[x + ((y + 1) % 20) * 16] * float(n))
                for dx in range(x - 1, x + 2):
                    for dy in range(y, y + 2):
                        if 0 <= dx < 16 and 0 <= dy < 20:
                            f = fround(f + g[dx + dy * 16])
                        n += 1
                h[x + y * 16] = fround(f / fround(n * fround(1.06)))
                if y >= 19:
                    h[x + y * 16] = fround(rnd.random() * rnd.random() * rnd.random() * 4.0 + rnd.random() * 0.10000000149011612 + 0.20000000298023224)
        g, h = h, g
        px = bytearray(1024)
        for i in range(256):
            f = min(1.0, max(0.0, fround(g[i] * fround(1.8))))
            px[i * 4] = int(f * 155.0 + 100.0) & 255
            px[i * 4 + 1] = int(f * f * 255.0) & 255
            px[i * 4 + 2] = int(f ** 10 * 255.0) & 255
            px[i * 4 + 3] = 0 if f < 0.5 else 255
        frames.append(bytes(px))
    return frames


class JavaRandom:
    def __init__(self, seed):
        self.s = (seed ^ 0x5DEECE66D) & ((1 << 48) - 1)

    def next(self, bits):
        self.s = (self.s * 0x5DEECE66D + 0xB) & ((1 << 48) - 1)
        return self.s >> (48 - bits)

    def next_float(self):
        return self.next(24) / float(1 << 24)


def portal_fx():
    r = JavaRandom(100)
    frames = []
    for t in range(32):
        px = bytearray(1024)
        for x in range(16):
            for y in range(16):
                f5 = 0.0
                for k in range(2):
                    o = float(k * 8)
                    f9 = fround(fround(fround(x - o) / 16.0) * 2.0)
                    f10 = fround(fround(fround(y - o) / 16.0) * 2.0)
                    if f9 < -1.0:
                        f9 = fround(f9 + 2.0)
                    if f9 >= 1.0:
                        f9 = fround(f9 - 2.0)
                    if f10 < -1.0:
                        f10 = fround(f10 + 2.0)
                    if f10 >= 1.0:
                        f10 = fround(f10 - 2.0)
                    f11 = fround(fround(f9 * f9) + fround(f10 * f10))
                    ang = fround(math.atan2(f10, f9))
                    w = fround(fround(fround(fround(fround(t / 32.0) * fround(3.1415927)) * 2.0) - fround(f11 * 10.0)) + float(k * 2))
                    f12 = fround(ang + fround(w * float(k * 2 - 1)))
                    f12 = fround(fround(mh_sin(f12) + 1.0) / 2.0)
                    f12 = fround(f12 / fround(f11 + 1.0))
                    f5 = fround(f5 + fround(f12 * 0.5))
                f5 = fround(f5 + fround(r.next_float() * fround(0.1)))
                i = (y * 16 + x) * 4
                px[i] = int(fround(fround(f5 * f5) * 200.0) + 55.0) & 255
                px[i + 1] = int(fround(fround(fround(fround(f5 * f5) * f5) * f5) * 255.0)) & 255
                px[i + 2] = int(fround(f5 * 100.0) + 155.0) & 255
                px[i + 3] = int(fround(f5 * 100.0) + 155.0) & 255
        frames.append(bytes(px))
    return frames


def strip(frames, size, scale_to=None):
    img = Image(size, size * len(frames))
    for n, f in enumerate(frames):
        fr = Image(16, 16, bytearray(f))
        if size == 32:
            big = Image(32, 32)
            for ox in (0, 16):
                for oy in (0, 16):
                    big.paste(fr, ox, oy)
            fr = big
        img.paste(fr, 0, n * size)
    return img


def compass_frames(base):
    """ItemCompass needle (class av) for Bedrock's 32 atlas frames (0 points down, then clockwise)."""
    frames = []
    for n in range(32):
        d = -n * 2 * math.pi / 32  # Beta draws "down" at d = 0 and "ahead" (up) at d = pi
        img = Image(16, 16, bytearray(base.data))
        s, c = math.sin(d), math.cos(d)
        for i in range(-4, 5):
            x = int(8.5 + c * i * 0.3)
            y = int(7.5 - s * i * 0.3 * 0.5)
            img.set(x, y, (100, 100, 100, 255))
        for i in range(-8, 17):
            x = int(8.5 + s * i * 0.3)
            y = int(7.5 + c * i * 0.3 * 0.5)
            img.set(x, y, (255, 20, 20, 255) if i >= 0 else (100, 100, 100, 255))
        frames.append(img)
    return frames


def clock_frames(base, dial, count):
    """ItemClock (class ku): the dial is rotated into the magenta pixels of the clock icon."""
    frames = []
    for n in range(count):
        ang = -(n / count) * math.pi * 2  # celestial angle n/count; frame 0 = noon on the dial
        s, c = math.sin(ang), math.cos(ang)
        img = Image(16, 16)
        for i in range(256):
            x, y = i % 16, i // 16
            r, g, b, a = base.get(x, y)
            if r == b and g == 0 and b > 0:
                d14 = -((x / 15.0) - 0.5)
                d16 = (y / 15.0) - 0.5
                br = r
                xx = int((d14 * c + d16 * s + 0.5) * 16.0)
                yy = int((d16 * c - d14 * s + 0.5) * 16.0)
                dr, dg, db, da = dial.get(xx & 15, yy & 15)
                r, g, b, a = dr * br // 255, dg * br // 255, db * br // 255, da
            img.set(x, y, (r, g, b, a))
        frames.append(img)
    return frames


# ---------------------------------------------------------------- main
def main():
    if os.path.isdir(TEX):
        shutil.rmtree(TEX)
    terrain = png.read(os.path.join(A, 'terrain.png'))
    items = png.read(os.path.join(A, 'gui', 'items.png'))
    grasscm = png.read(os.path.join(A, 'misc', 'grasscolor.png'))
    foliagecm = png.read(os.path.join(A, 'misc', 'foliagecolor.png'))

    for i, names in BLOCKS.items():
        t = tile(terrain, i)
        for n in names:
            png.write(out(n + '.png'), t)
    for i, names in BLOCK_TGA.items():
        t = tile(terrain, i)
        for n in names:
            tga.write(out(n + '.tga'), t)
    for s in range(8):
        png.write(out(f'blocks/wheat_stage_{s}.png'), tile(terrain, WHEAT + s))
    for s in range(10):
        png.write(out(f'environment/destroy_stage_{s}.png'), tile(terrain, 240 + s))

    # grass: BlockGrass sides are tile 3 with tile 38 (grey fringe) drawn over it, tinted (fancy graphics)
    side, fringe = tile(terrain, 3), tile(terrain, 38)
    gside = Image(16, 16)
    for y in range(16):
        for x in range(16):
            f = fringe.get(x, y)
            gside.set(x, y, (f[0], f[1], f[2], 255) if f[3] > 0 else side.get(x, y)[:3] + (0,))
    tga.write(out('blocks/grass_side.tga'), gside)
    inv_grass = colormap_color(grasscm, 0.5, 1.0)  # BlockGrass.getRenderColor
    carried_side = Image(16, 16)
    for y in range(16):
        for x in range(16):
            r, g, b, a = gside.get(x, y)
            carried_side.set(x, y, (r * inv_grass[0] // 255, g * inv_grass[1] // 255, b * inv_grass[2] // 255, 255) if a else (r, g, b, 255))
    png.write(out('blocks/grass_side_carried.png'), carried_side)
    png.write(out('blocks/grass_carried.png'), opaque(tint(tile(terrain, 0), inv_grass)))
    snowed = tile(terrain, 68)
    png.write(out('blocks/grass_side_snowed.png'), snowed)
    tga.write(out('blocks/grass_side_snowed.tga'), Image(16, 16, bytearray(
        b for px in range(256) for b in (snowed.data[px * 4:px * 4 + 3] + bytes([0])))))
    # inventory colours: ColorizerFoliage basic / pine / birch, tall grass like grass
    tga.write(out('blocks/leaves_oak_carried.tga'), tint(tile(terrain, 52), (0x48, 0xb5, 0x18)))
    tga.write(out('blocks/leaves_birch_carried.tga'), tint(tile(terrain, 52), (0x80, 0xa7, 0x55)))
    tga.write(out('blocks/leaves_spruce_carried.tga'), tint(tile(terrain, 132), (0x61, 0x99, 0x61)))
    tga.write(out('blocks/tallgrass_carried.tga'), tint(tile(terrain, 39), inv_grass))
    tga.write(out('blocks/fern_carried.tga'), tint(tile(terrain, 56), inv_grass))
    png.write(out('blocks/tallgrass.png'), tile(terrain, 39))

    # animated textures
    rnd = random.Random(173)
    n, k = 256, 32
    still = loop_frames(water_fx(False, 100 + n + k, rnd)[100:], n, k)
    flow = loop_frames(water_fx(True, 100 + n + k, rnd)[100:], n, k)
    for name in ('blocks/water_still', 'blocks/water_still_grey'):
        png.write(out(name + '.png'), strip(still, 16))
    for name in ('blocks/water_flow', 'blocks/water_flow_grey'):
        png.write(out(name + '.png'), strip(flow, 32))
    lstill = loop_frames(lava_fx(False, 300 + n + k, rnd)[300:], n, k)
    lflow = loop_frames(lava_fx(True, 300 + n + k, rnd)[300:], n, k)
    png.write(out('blocks/lava_still.png'), strip(lstill, 16))
    png.write(out('blocks/lava_flow.png'), strip(lflow, 32))
    for fi in (0, 1):
        fr = loop_frames(fire_fx(100 + n + k, rnd)[100:], n, k)
        png.write(out(f'blocks/fire_{fi}.png'), strip(fr, 16))
    png.write(out('blocks/portal.png'), strip(portal_fx(), 16))

    # items
    for (cx, cy), names in ITEMS.items():
        t = items.crop(cx * 16, cy * 16, 16, 16)
        for name in (names if isinstance(names, list) else [names]):
            png.write(out(f'items/{name}.png'), t)
    for (cx, cy), name in LEATHER.items():
        png.write(out(f'items/{name}.png'), items.crop(cx * 16, cy * 16, 16, 16))
    for meta, colour in enumerate(DYES):
        t = items.crop((14 + meta // 8) * 16, (4 + meta % 8) * 16, 16, 16)
        png.write(out(f'items/dye_powder_{colour}.png'), t)
        if colour in ('black', 'blue', 'brown', 'white'):
            png.write(out(f'items/dye_powder_{colour}_new.png'), t)
    for n2 in range(3):  # Beta's bow has no draw frames
        png.write(out(f'items/bow_pulling_{n2}.png'), items.crop(5 * 16, 1 * 16, 16, 16))
    png.write(out('items/fishing_rod_cast.png'), items.crop(5 * 16, 5 * 16, 16, 16))
    compass = items.crop(6 * 16, 3 * 16, 16, 16)
    cf = compass_frames(compass)
    atlas = Image(16, 16 * len(cf))
    for i, f in enumerate(cf):
        atlas.paste(f, 0, i * 16)
    png.write(out('items/compass_atlas.png'), atlas)
    png.write(out('items/compass_item.png'), cf[0])
    clock = items.crop(6 * 16, 4 * 16, 16, 16)
    dial = png.read(os.path.join(A, 'misc', 'dial.png'))
    wf = clock_frames(clock, dial, 64)
    atlas = Image(16, 16 * len(wf))
    for i, f in enumerate(wf):
        atlas.paste(f, 0, i * 16)
    png.write(out('items/watch_atlas.png'), atlas)
    png.write(out('items/clock_item.png'), wf[0])

    # colour maps, sky, weather, misc
    shutil.copy(os.path.join(A, 'misc', 'grasscolor.png'), out('colormap/grass.png'))
    shutil.copy(os.path.join(A, 'misc', 'foliagecolor.png'), out('colormap/foliage.png'))
    shutil.copy(os.path.join(A, 'environment', 'clouds.png'), out('environment/clouds.png'))
    shutil.copy(os.path.join(A, 'terrain', 'sun.png'), out('environment/sun.png'))
    moon = png.read(os.path.join(A, 'terrain', 'moon.png'))
    phases = Image(128, 64)
    for py in range(2):
        for pxx in range(4):
            phases.paste(moon, pxx * 32, py * 32)  # Beta's moon has no phases
    png.write(out('environment/moon_phases.png'), phases)
    rain = png.read(os.path.join(A, 'environment', 'rain.png'))
    snow = png.read(os.path.join(A, 'environment', 'snow.png'))
    weather = Image(64, 32)
    weather.paste(rain.crop(0, 0, 32, 32), 0, 0)
    weather.paste(snow.crop(0, 0, 32, 32), 32, 0)
    png.write(out('environment/weather.png'), weather)
    shutil.copy(os.path.join(A, 'misc', 'pumpkinblur.png'), out('misc/pumpkinblur.png'))
    shutil.copy(os.path.join(A, 'art', 'kz.png'), out('painting/kz.png'))
    for f in ('chain_1', 'chain_2', 'diamond_1', 'diamond_2', 'gold_1', 'gold_2', 'iron_1', 'iron_2', 'cloth_1', 'cloth_2'):
        shutil.copy(os.path.join(A, 'armor', f + '.png'), out(f'models/armor/{f}.png'))
    for f, to in (('cloth_1', 'leather_1'), ('cloth_2', 'leather_2')):
        shutil.copy(os.path.join(A, 'armor', f + '.png'), out(f'models/armor/{to}.png'))
    os.makedirs(os.path.join(RP, 'font'), exist_ok=True)
    shutil.copy(os.path.join(A, 'font', 'default.png'), os.path.join(RP, 'font', 'default8.png'))

    build_gui(items)

    write_json(os.path.join(TEX, 'flipbook_textures.json'), [
        {'flipbook_texture': 'textures/blocks/water_still_grey', 'atlas_tile': 'still_water_grey', 'ticks_per_frame': 1},
        {'flipbook_texture': 'textures/blocks/water_flow_grey', 'atlas_tile': 'flowing_water_grey', 'ticks_per_frame': 1, 'replicate': 2},
        {'flipbook_texture': 'textures/blocks/water_still', 'atlas_tile': 'still_water', 'ticks_per_frame': 1},
        {'flipbook_texture': 'textures/blocks/water_flow', 'atlas_tile': 'flowing_water', 'ticks_per_frame': 1, 'replicate': 2},
        {'flipbook_texture': 'textures/blocks/lava_still', 'atlas_tile': 'still_lava', 'ticks_per_frame': 1},
        {'flipbook_texture': 'textures/blocks/lava_flow', 'atlas_tile': 'flowing_lava', 'ticks_per_frame': 1, 'replicate': 2},
        {'flipbook_texture': 'textures/blocks/fire_0', 'atlas_tile': 'fire_0', 'ticks_per_frame': 1},
        {'flipbook_texture': 'textures/blocks/fire_1', 'atlas_tile': 'fire_1', 'ticks_per_frame': 1},
        {'flipbook_texture': 'textures/blocks/portal', 'atlas_tile': 'portal', 'ticks_per_frame': 1},
    ])
    write_pack_json()
    # No main-menu files (title logo, splashes, panorama): a world's packs never reach the menu, and 1.26.60
    # crashed decoding its menu panorama while switching to the world's packs with panorama_N.png overridden.
    if os.path.exists(os.path.join(RP, 'splashes.json')):
        os.remove(os.path.join(RP, 'splashes.json'))
    count = sum(len(fs) for _, _, fs in os.walk(TEX))
    print('resource pack textures written:', count)


def build_gui(items):
    icons_b = png.read(os.path.join(A, 'gui', 'icons.png'))
    gui_b = png.read(os.path.join(A, 'gui', 'gui.png'))
    # Bedrock keeps the old icons.png layout for these; Beta has no hunger or experience
    icons = png.read(os.path.join(ROOT, 're', 'vanilla_rp', 'textures', 'gui', 'icons.png'))
    for (x, y, w, h) in ((0, 0, 16, 16), (16, 0, 72, 9), (16, 9, 27, 9), (16, 18, 18, 9)):
        icons.paste(icons_b.crop(x, y, w, h), x, y)
    for (x, y, w, h) in ((16, 27, 117, 9), (0, 64, 182, 10)):
        icons.paste(Image(w, h), x, y)
    png.write(out('gui/icons.png'), icons)
    ui = {
        'heart_background': (16, 0), 'heart_blink': (25, 0), 'heart': (52, 0), 'heart_half': (61, 0),
        'heart_flash': (70, 0), 'heart_flash_half': (79, 0), 'heart_new': (52, 0),
        'armor_empty': (16, 9), 'armor_half': (25, 9), 'armor_full': (34, 9),
        'bubble': (16, 18), 'bubble_pop': (25, 18), 'bubbles_full': (16, 18), 'bubbles_empty': (25, 18),
    }
    for name, (x, y) in ui.items():
        png.write(out(f'ui/{name}.png'), icons_b.crop(x, y, 9, 9))
    for name in ('hunger_background', 'hunger_blink', 'hunger_full', 'hunger_half', 'hunger_flash_full',
                 'hunger_flash_half', 'hunger_effect', 'hunger_effect_background', 'hunger_effect_full',
                 'hunger_effect_half', 'hunger_effect_flash_full', 'hunger_effect_flash_half'):
        png.write(out(f'ui/{name}.png'), Image(9, 9))
    for name, (w, h) in (('experiencebarempty', (13, 5)), ('experiencebarfull', (13, 5)), ('experiencenub', (11, 5)),
                         ('experience_bar_empty_blue', (13, 5)), ('experience_bar_full_blue', (13, 5)),
                         ('experience_bar_full_white', (13, 5)), ('experience_bar_nub_blue', (11, 5))):
        png.write(out(f'ui/{name}.png'), Image(w, h))
    # hotbar: 1px cap, nine 20px slots, 1px cap (gui.png 0,0 182x22); selection frame at 0,22
    png.write(out('ui/hotbar_start_cap.png'), gui_b.crop(0, 0, 1, 22))
    png.write(out('ui/hotbar_end_cap.png'), gui_b.crop(181, 0, 1, 22))
    for i in range(9):
        png.write(out(f'ui/hotbar_{i}.png'), gui_b.crop(1 + 20 * i, 0, 20, 22))
    png.write(out('ui/selected_hotbar_slot.png'), gui_b.crop(0, 22, 24, 24))
    for i, part in enumerate(('helmet', 'chestplate', 'leggings', 'boots')):
        png.write(out(f'ui/empty_armor_slot_{part}.png'), items.crop(15 * 16, i * 16, 16, 16))


VANILLA = r'C:/XboxGames/Minecraft for Windows/Content/data/resource_packs'


def write_pack_json():
    """blocks.json without Bedrock's random top/bottom rotation (Beta never rotated textures), and the plains
    client biome / fog: water untinted (Beta's water texture has its own colour), Beta's fog colours."""
    import glob
    import re

    def ver(f):
        m = re.search(r'vanilla_(\d+)\.(\d+)\.?(\d*)', f)
        return tuple(int(x or 0) for x in m.groups()) if m else (0,)
    merged = {}
    for f in [os.path.join(VANILLA, 'vanilla', 'blocks.json')] + sorted(glob.glob(VANILLA + '/vanilla_*/blocks.json'), key=ver):
        d = json.loads(re.sub(r'//.*', '', open(f, encoding='utf-8').read()))
        merged.update({k: v for k, v in d.items() if k != 'format_version'})
    blocks = {'format_version': [1, 1, 0]}
    for k in ('grass', 'dirt', 'sand', 'gravel', 'clay', 'glowstone', 'lava', 'flowing_lava', 'netherrack', 'obsidian',
              'snow', 'snow_layer', 'sponge', 'sandstone', 'oak_leaves', 'spruce_leaves', 'birch_leaves', 'leaves'):
        if k in merged:
            blocks[k] = dict(merged[k], isotropic=False)
    write_json(os.path.join(RP, 'blocks.json'), blocks)
    write_json(os.path.join(RP, 'biomes', 'plains.client_biome.json'), {
        'format_version': '1.21.120',
        'minecraft:client_biome': {'description': {'identifier': 'minecraft:plains'}, 'components': {
            'minecraft:ambient_sounds': {'underwater_addition': {'asset': 'ambient.underwater.additions', 'chance': 0.01},
                                         'underwater_loop': 'ambient.underwater.loop'},
            'minecraft:fog_appearance': {'fog_identifier': 'b173:fog_overworld'},
            'minecraft:water_appearance': {'surface_color': '#FFFFFF'},
            'minecraft:atmosphere_identifier': {'atmosphere_identifier': 'minecraft:default_atmospherics'},
            'minecraft:color_grading_identifier': {'color_grading_identifier': 'minecraft:default_color_grading'},
            'minecraft:lighting_identifier': {'lighting_identifier': 'minecraft:default_lighting'},
            'minecraft:water_identifier': {'water_identifier': 'minecraft:default_water'}}}})
    write_json(os.path.join(RP, 'fogs', 'b173_overworld.json'), {
        'format_version': '1.16.100',
        'minecraft:fog_settings': {'description': {'identifier': 'b173:fog_overworld'}, 'distance': {
            'air': {'fog_start': 0.6, 'fog_end': 1.0, 'fog_color': '#C0D8FF', 'render_distance_type': 'render'},
            'weather': {'fog_start': 0.23, 'fog_end': 0.7, 'fog_color': '#7F8896', 'render_distance_type': 'render'},
            'water': {'fog_start': 0.0, 'fog_end': 16.0, 'fog_color': '#05054E', 'render_distance_type': 'fixed'},
            'lava': {'fog_start': 0.0, 'fog_end': 2.0, 'fog_color': '#991900', 'render_distance_type': 'fixed'},
            'lava_resistance': {'fog_start': 2.0, 'fog_end': 4.0, 'fog_color': '#991900', 'render_distance_type': 'fixed'}}}})
    # Beta's nether is one biome (Hell): the newer nether biomes look like Nether Wastes (no spores, ash or fog tint)
    hell = {
        'minecraft:fog_appearance': {'fog_identifier': 'minecraft:fog_hell'},
        'minecraft:water_appearance': {'surface_color': '#905957'},
        'minecraft:atmosphere_identifier': {'atmosphere_identifier': 'minecraft:hell_atmospherics'},
        'minecraft:color_grading_identifier': {'color_grading_identifier': 'minecraft:default_color_grading'},
        'minecraft:lighting_identifier': {'lighting_identifier': 'minecraft:nether_lighting'},
        'minecraft:water_identifier': {'water_identifier': 'minecraft:default_water'},
        'minecraft:biome_music': {'music_definition': 'hell'},
    }
    for b in ('crimson_forest', 'warped_forest', 'soulsand_valley', 'basalt_deltas'):
        write_json(os.path.join(RP, 'biomes', f'{b}.client_biome.json'), {
            'format_version': '1.21.120',
            'minecraft:client_biome': {'description': {'identifier': f'minecraft:{b}'}, 'components': hell}})
    write_json(os.path.join(RP, 'biomes_client.json'), {'biomes': {
        'default': {'water_surface_color': '#FFFFFF', 'water_surface_transparency': 0.65, 'water_fog_color': '#05054E',
                    'water_fog_distance': 16, 'fog_color': '#C0D8FF'},
        'plains': {'water_surface_color': '#FFFFFF', 'water_fog_color': '#05054E', 'fog_identifier': 'b173:fog_overworld'}}})


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, indent=4)
        f.write('\n')


if __name__ == '__main__':
    main()
