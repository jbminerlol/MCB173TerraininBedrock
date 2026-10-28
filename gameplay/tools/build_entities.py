"""Client entity definitions for the Beta mobs: Bedrock's legacy (v1.0) definitions use the same 64x32 models and
UV layout as b1.7.3, so they are reused with the Beta skins from the jar and private copies of their render
controllers (newer packs redefine the vanilla controllers for the 1.21 mob variants)."""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import png  # noqa: E402
import tga  # noqa: E402
from png import Image  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 're', 'assets', 'mob')
V = os.path.join(ROOT, 're', 'vanilla_rp')
RP = os.path.join(ROOT, 'packs', 'RP')

# vanilla legacy entity file -> {texture key: (output name, builder)}
MOBS = {
    'pig.v1.0': {'default': 'pig', 'saddled': 'pig_saddle'},
    'cow.v1.0': {'default': 'cow'},
    'sheep.v1.0': {'default': 'sheep'},
    'chicken.v1.0': {'default': 'chicken'},
    'squid': {'default': 'squid'},
    'wolf': {'default': 'wolf', 'angry': 'wolf_angry', 'tame': 'wolf_tame'},
    'creeper.v1.0': {'default': 'creeper'},
    'skeleton.v1.0': {'default': 'skeleton'},
    'spider.v1.0': {'default': 'spider'},
    'zombie.v1.0': {'default': 'zombie'},
    'slime': {'default': 'slime'},
    'ghast': {'default': 'ghast', 'shooting': 'ghast_fire'},
    'zombie_pigman.v1.0': {'default': 'pigzombie'},
}


def load(path):
    return json.loads(re.sub(r'//.*', '', open(path, encoding='utf-8').read()))


def textures():
    out = os.path.join(RP, 'textures', 'b173')
    os.makedirs(out, exist_ok=True)
    for name in ('pig', 'cow', 'chicken', 'squid', 'wolf', 'wolf_angry', 'wolf_tame', 'creeper', 'skeleton',
                 'zombie', 'slime', 'ghast', 'ghast_fire', 'pigzombie'):
        png.write(os.path.join(out, name + '.png'), png.read(os.path.join(A, name + '.png')))
    # saddled pig: the saddle drawn over the pig skin (Bedrock swaps the whole texture)
    pig, saddle = png.read(os.path.join(A, 'pig.png')), png.read(os.path.join(A, 'saddle.png'))
    for y in range(pig.h):
        for x in range(pig.w):
            s = saddle.get(x, y)
            if s[3] > 0:
                pig.set(x, y, s)
    png.write(os.path.join(out, 'pig_saddle.png'), pig)
    # sheep: skin on top, fleece (sheep_fur.png, tinted by wool colour) below, as geometry.sheep expects
    sheep = Image(64, 64)
    sheep.paste(png.read(os.path.join(A, 'sheep.png')), 0, 0)
    sheep.paste(png.read(os.path.join(A, 'sheep_fur.png')), 0, 32)
    png.write(os.path.join(out, 'sheep.png'), sheep)
    # spider: eyes are emissive where alpha is ~0 in Bedrock's spider material
    spider, eyes = png.read(os.path.join(A, 'spider.png')), png.read(os.path.join(A, 'spider_eyes.png'))
    for y in range(spider.h):
        for x in range(spider.w):
            e = eyes.get(x, y)
            if e[3] > 0:
                spider.set(x, y, (e[0], e[1], e[2], 3))
            else:
                r, g, b, _ = spider.get(x, y)
                spider.set(x, y, (r, g, b, 255))
    tga.write(os.path.join(out, 'spider.tga'), spider)
    # default player skin: Beta's 64x32 char.png in the 64x64 layout (legs/arms mirrored for the left side)
    char = png.read(os.path.join(A, 'char.png'))
    steve = Image(64, 64)
    steve.paste(char, 0, 0)
    steve.paste(mirror_limb(char.crop(0, 16, 16, 16)), 16, 48)   # left leg
    steve.paste(mirror_limb(char.crop(40, 16, 16, 16)), 32, 48)  # left arm
    os.makedirs(os.path.join(RP, 'textures', 'entity'), exist_ok=True)
    png.write(os.path.join(RP, 'textures', 'entity', 'steve.png'), steve)


def mirror_limb(src):
    """The old 64x32 skin draws the left limbs as mirrored right ones: flip every face and swap the two sides."""
    def flip(img):
        o = Image(img.w, img.h)
        for y in range(img.h):
            for x in range(img.w):
                o.set(img.w - 1 - x, y, img.get(x, y))
        return o
    out = Image(16, 16)
    out.paste(flip(src.crop(4, 0, 4, 4)), 4, 0)    # top
    out.paste(flip(src.crop(8, 0, 4, 4)), 8, 0)    # bottom
    out.paste(flip(src.crop(8, 4, 4, 12)), 0, 4)   # outer side <- inner side
    out.paste(flip(src.crop(4, 4, 4, 12)), 4, 4)   # front
    out.paste(flip(src.crop(0, 4, 4, 12)), 8, 4)   # inner side <- outer side
    out.paste(flip(src.crop(12, 4, 4, 12)), 12, 4)  # back
    return out


def main():
    textures()
    rcs_all = {}
    import glob
    for f in glob.glob(os.path.join(V, 'render_controllers', '*.json')):
        try:
            rcs_all.update(load(f).get('render_controllers', {}))
        except Exception:
            pass
    rcs = {}
    os.makedirs(os.path.join(RP, 'entity'), exist_ok=True)
    for src, texmap in MOBS.items():
        d = load(os.path.join(V, 'entity', src + '.entity.json'))
        desc = d['minecraft:client_entity']['description']
        desc['textures'] = {k: f'textures/b173/{v}' for k, v in texmap.items()} | {
            k: v for k, v in desc['textures'].items() if k not in texmap}
        new_rcs = []
        for r in desc.get('render_controllers', []):
            name, cond = (r, None) if isinstance(r, str) else next(iter(r.items()))
            if name in ('controller.render.creeper_armor', 'controller.render.slime_armor'):
                new_rcs.append(r)
                continue
            mine = name.replace('controller.render.', 'controller.render.b173.')
            rcs[mine] = rcs_all[name]
            new_rcs.append(mine if cond is None else {mine: cond})
        desc['render_controllers'] = new_rcs
        out = src.split('.v')[0]
        with open(os.path.join(RP, 'entity', f'{out}.entity.json'), 'w', encoding='utf-8', newline='\n') as f:
            json.dump(d, f, indent=4)
    os.makedirs(os.path.join(RP, 'render_controllers'), exist_ok=True)
    with open(os.path.join(RP, 'render_controllers', 'b173.render_controllers.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'format_version': '1.8.0', 'render_controllers': rcs}, f, indent=4)
    print('wrote', len(MOBS), 'entities,', len(rcs), 'render controllers')


if __name__ == '__main__':
    main()
