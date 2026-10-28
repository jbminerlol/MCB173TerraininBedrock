"""Behavior pack data for Beta 1.7.3 gameplay:
  - recipes: every data-driven vanilla recipe is moved to an unused crafting tag, and the 151 crafting / 10 smelting
    recipes dumped from b173.jar (re/recipes.jsonl, `Harness recipes`) are added with Beta's output counts;
  - loot_tables/entities: the b1.7.3 mob drops (EntityLiving.dropFewItems and overrides);
  - spawn_rules: only Beta's mobs spawn naturally (wolves and slimes are spawned by script, on Beta's biome and
    slime-chunk rules, because a void-flat world has a single Bedrock biome).
"""
import json
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BP = os.path.join(ROOT, 'packs', 'BP')
VBP = os.path.join(ROOT, 're', 'vanilla_bp')

DYE = ['ink_sac', 'red_dye', 'green_dye', 'cocoa_beans', 'lapis_lazuli', 'purple_dye', 'cyan_dye', 'light_gray_dye',
       'gray_dye', 'pink_dye', 'lime_dye', 'yellow_dye', 'light_blue_dye', 'magenta_dye', 'orange_dye', 'bone_meal']
WOOL = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple',
        'blue', 'brown', 'green', 'red', 'black']
ITEMS = {
    256: 'iron_shovel', 257: 'iron_pickaxe', 258: 'iron_axe', 259: 'flint_and_steel', 260: 'apple', 261: 'bow',
    262: 'arrow', 264: 'diamond', 265: 'iron_ingot', 266: 'gold_ingot', 267: 'iron_sword', 268: 'wooden_sword',
    269: 'wooden_shovel', 270: 'wooden_pickaxe', 271: 'wooden_axe', 272: 'stone_sword', 273: 'stone_shovel',
    274: 'stone_pickaxe', 275: 'stone_axe', 276: 'diamond_sword', 277: 'diamond_shovel', 278: 'diamond_pickaxe',
    279: 'diamond_axe', 280: 'stick', 281: 'bowl', 282: 'mushroom_stew', 283: 'golden_sword', 284: 'golden_shovel',
    285: 'golden_pickaxe', 286: 'golden_axe', 287: 'string', 288: 'feather', 289: 'gunpowder', 290: 'wooden_hoe',
    291: 'stone_hoe', 292: 'iron_hoe', 293: 'diamond_hoe', 294: 'golden_hoe', 295: 'wheat_seeds', 296: 'wheat',
    297: 'bread', 298: 'leather_helmet', 299: 'leather_chestplate', 300: 'leather_leggings', 301: 'leather_boots',
    302: 'chainmail_helmet', 303: 'chainmail_chestplate', 304: 'chainmail_leggings', 305: 'chainmail_boots',
    306: 'iron_helmet', 307: 'iron_chestplate', 308: 'iron_leggings', 309: 'iron_boots', 310: 'diamond_helmet',
    311: 'diamond_chestplate', 312: 'diamond_leggings', 313: 'diamond_boots', 314: 'golden_helmet',
    315: 'golden_chestplate', 316: 'golden_leggings', 317: 'golden_boots', 318: 'flint', 319: 'porkchop',
    320: 'cooked_porkchop', 321: 'painting', 322: 'golden_apple', 323: 'oak_sign', 324: 'wooden_door', 325: 'bucket',
    326: 'water_bucket', 327: 'lava_bucket', 328: 'minecart', 329: 'saddle', 330: 'iron_door', 331: 'redstone',
    332: 'snowball', 333: 'oak_boat', 334: 'leather', 335: 'milk_bucket', 336: 'brick', 337: 'clay_ball',
    338: 'sugar_cane', 339: 'paper', 340: 'book', 341: 'slime_ball', 342: 'chest_minecart', 343: None, 344: 'egg',
    345: 'compass', 346: 'fishing_rod', 347: 'clock', 348: 'glowstone_dust', 349: 'cod', 350: 'cooked_cod',
    352: 'bone', 353: 'sugar', 354: 'cake', 355: 'bed', 356: 'repeater', 357: 'cookie', 358: 'empty_map',
    359: 'shears', 2256: 'music_disc_13', 2257: 'music_disc_cat',
}
BLOCKS = {
    1: 'stone', 2: 'grass_block', 3: 'dirt', 4: 'cobblestone', 5: 'oak_planks', 7: 'bedrock', 12: 'sand', 13: 'gravel',
    14: 'gold_ore', 15: 'iron_ore', 16: 'coal_ore', 19: 'sponge', 20: 'glass', 21: 'lapis_ore', 22: 'lapis_block',
    23: 'dispenser', 24: 'sandstone', 25: 'noteblock', 27: 'golden_rail', 28: 'detector_rail', 29: 'sticky_piston',
    30: 'web', 32: 'deadbush', 33: 'piston', 37: 'dandelion', 38: 'poppy', 39: 'brown_mushroom', 40: 'red_mushroom',
    41: 'gold_block', 42: 'iron_block', 45: 'brick_block', 46: 'tnt', 47: 'bookshelf', 48: 'mossy_cobblestone',
    49: 'obsidian', 50: 'torch', 53: 'oak_stairs', 54: 'chest', 56: 'diamond_ore', 57: 'diamond_block',
    58: 'crafting_table', 61: 'furnace', 65: 'ladder', 66: 'rail', 67: 'stone_stairs', 69: 'lever',
    70: 'stone_pressure_plate', 72: 'wooden_pressure_plate', 73: 'redstone_ore', 76: 'redstone_torch',
    77: 'stone_button', 78: 'snow_layer', 79: 'ice', 80: 'snow', 81: 'cactus', 82: 'clay', 84: 'jukebox',
    85: 'oak_fence', 86: 'carved_pumpkin', 87: 'netherrack', 88: 'soul_sand', 89: 'glowstone', 91: 'lit_pumpkin',
    96: 'trapdoor',
}
SLABS = ['smooth_stone_slab', 'sandstone_slab', 'oak_slab', 'cobblestone_slab']
LOGS = ['oak_log', 'spruce_log', 'birch_log']


def ingredient(id_, dmg):
    """Beta (id, damage) -> Bedrock recipe ingredient; damage -1 is Beta's "any variant"."""
    if id_ == 17:
        return {'tag': 'minecraft:logs'} if dmg == -1 else {'item': f'minecraft:{LOGS[dmg]}'}
    if id_ == 5:
        return {'tag': 'minecraft:planks'}
    if id_ == 35:
        return {'tag': 'minecraft:wool'} if dmg == -1 else {'item': f'minecraft:{WOOL[dmg]}_wool'}
    if id_ == 263:
        return {'tag': 'minecraft:coals'} if dmg == -1 else {'item': 'minecraft:charcoal' if dmg == 1 else 'minecraft:coal'}
    if id_ == 351:
        return {'item': f'minecraft:{DYE[max(dmg, 0)]}'}
    if id_ == 44:
        return {'item': f'minecraft:{SLABS[max(dmg, 0)]}'}
    name = ITEMS.get(id_) if id_ >= 256 else BLOCKS.get(id_)
    return {'item': f'minecraft:{name}'} if name else None


def result(id_, count, dmg):
    if id_ == 17:
        name = LOGS[dmg]
    elif id_ == 35:
        name = f'{WOOL[dmg]}_wool'
    elif id_ == 263:
        name = 'charcoal' if dmg == 1 else 'coal'
    elif id_ == 351:
        name = DYE[dmg]
    elif id_ == 44:
        name = SLABS[dmg]
    elif id_ == 355:
        return {'item': 'minecraft:bed', 'data': 14, 'count': count}  # Beta's bed is red
    else:
        name = ITEMS.get(id_) if id_ >= 256 else BLOCKS.get(id_)
    return {'item': f'minecraft:{name}', 'count': count} if name else None


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, indent=2)


ALWAYS = {'context': 'AlwaysUnlocked'}  # Beta has no recipe book: everything craftable from the start


def recipes():
    out = os.path.join(BP, 'recipes')
    if os.path.isdir(out):
        shutil.rmtree(out)
    disabled = 0
    seen = set()
    for fn in sorted(os.listdir(os.path.join(VBP, 'recipes'))):
        try:
            d = json.loads(re.sub(r'//.*', '', open(os.path.join(VBP, 'recipes', fn), encoding='utf-8').read()))
        except Exception:
            continue
        kind = next((k for k in d if k.startswith('minecraft:recipe')), None)
        if not kind or 'tags' not in d[kind]:
            continue
        # Stonecutter and smithing recipes stay: those stations cannot be crafted here, and the game rejects them
        # retagged (smithing needs its own tag, stonecutting ones collide on their single ingredient).
        if kind.startswith('minecraft:recipe_smithing') or d[kind]['tags'] == ['stonecutter']:
            continue
        ident = d[kind]['description']['identifier']
        if ident in seen:  # a few vanilla files share an identifier; a pack may only define it once
            continue
        seen.add(ident)
        d[kind]['tags'] = ['b173_disabled']  # no crafting station uses this tag
        d[kind].setdefault('unlock', ALWAYS)  # 1.20+ recipes are rejected without unlock data
        write(os.path.join(out, 'vanilla', fn), d)
        disabled += 1
    added = skipped = 0
    for n, line in enumerate(open(os.path.join(ROOT, 're', 'recipes.jsonl'), encoding='utf-8')):
        r = json.loads(line)
        ident = f'b173:recipe_{n}'
        if r['class'] == 'smelt':
            inp = ingredient(r['in'], -1)
            res = result(*r['out'])
            if not inp or not res:
                skipped += 1
                continue
            write(os.path.join(out, 'beta', f'smelt_{n}.json'), {
                'format_version': '1.20.10',
                'minecraft:recipe_furnace': {'description': {'identifier': ident}, 'tags': ['furnace'],
                                              'input': inp, 'output': res}})
            added += 1
            continue
        if r['class'] == 'is':  # ShapedRecipes: b = width, c = height, d = cells, e = output
            w, h, cells, outp = r['b'], r['c'], r['d'], r['e']
            keys, pattern, ok = {}, [], True
            sym = iter('ABCDEFGHI')
            seen = {}
            for y in range(h):
                row = ''
                for x in range(w):
                    c = cells[y * w + x]
                    if c is None:
                        row += ' '
                        continue
                    k = (c[0], c[2])
                    if k not in seen:
                        ing = ingredient(c[0], c[2])
                        if ing is None:
                            ok = False
                            break
                        seen[k] = next(sym)
                        keys[seen[k]] = ing
                    row += seen[k]
                pattern.append(row)
            res = result(*outp)
            if not ok or not res:
                skipped += 1
                continue
            write(os.path.join(out, 'beta', f'shaped_{n}.json'), {
                'format_version': '1.20.10',
                'minecraft:recipe_shaped': {'description': {'identifier': ident}, 'tags': ['crafting_table'],
                                             'pattern': pattern, 'key': keys, 'unlock': ALWAYS, 'result': res}})
            added += 1
        else:  # ShapelessRecipes: a = output, b = ingredients
            ings = [ingredient(c[0], c[2]) for c in r['b']]
            res = result(*r['a'])
            if None in ings or not res:
                skipped += 1
                continue
            write(os.path.join(out, 'beta', f'shapeless_{n}.json'), {
                'format_version': '1.20.10',
                'minecraft:recipe_shapeless': {'description': {'identifier': ident}, 'tags': ['crafting_table'],
                                                'ingredients': ings, 'unlock': ALWAYS, 'result': res}})
            added += 1
    print(f'recipes: {disabled} vanilla disabled, {added} Beta added, {skipped} without a Bedrock equivalent')


def drops(item, lo=0, hi=2, extra=None):
    e = {'type': 'item', 'name': f'minecraft:{item}', 'weight': 1,
         'functions': [{'function': 'set_count', 'count': {'min': lo, 'max': hi}}] + (extra or [])}
    return {'rolls': 1, 'entries': [e]}


def loot():
    ent = os.path.join(BP, 'loot_tables', 'entities')
    tables = {
        'zombie': [drops('feather')],
        'skeleton': [drops('arrow'), drops('bone')],
        'spider': [drops('string')],
        'cave_spider': [drops('string')],
        'creeper': [drops('gunpowder'), {'conditions': [{'condition': 'killed_by_entity', 'entity_type': 'minecraft:skeleton'}],
                                         'rolls': 1, 'entries': [{'type': 'item', 'name': 'minecraft:music_disc_13', 'weight': 1},
                                                                 {'type': 'item', 'name': 'minecraft:music_disc_cat', 'weight': 1}]}],
        'pig': [drops('porkchop', extra=[{'function': 'furnace_smelt', 'conditions': [{'condition': 'entity_properties', 'entity': 'this', 'properties': {'on_fire': True}}]}])],
        'pig_saddled': [drops('porkchop', extra=[{'function': 'furnace_smelt', 'conditions': [{'condition': 'entity_properties', 'entity': 'this', 'properties': {'on_fire': True}}]}])],
        'cow': [drops('leather')],
        'chicken': [drops('feather')],
        'squid': [drops('ink_sac', 1, 3)],
        'ghast': [drops('gunpowder')],
        'zombie_pigman': [drops('cooked_porkchop')],
        'wolf': [],
        'slime': [{'conditions': [{'condition': 'has_variant', 'value': 1}], **drops('slime_ball')}],
    }
    for name, pools in tables.items():
        write(os.path.join(ent, f'{name}.json'), {'pools': pools})
    # sheep: one wool of its colour unless sheared (vanilla tables already do exactly this per colour)
    print('loot tables:', len(tables))


BETA_SPAWNS = {'pig', 'cow', 'sheep', 'chicken', 'squid', 'zombie', 'skeleton', 'creeper', 'spider', 'ghast', 'zombie_pigman'}


def spawn_rules():
    out = os.path.join(BP, 'spawn_rules')
    if os.path.isdir(out):
        shutil.rmtree(out)
    n = 0
    for fn in sorted(os.listdir(os.path.join(VBP, 'spawn_rules'))):
        d = json.loads(re.sub(r'//.*', '', open(os.path.join(VBP, 'spawn_rules', fn), encoding='utf-8').read()))
        name = fn[:-5]
        rules = d['minecraft:spawn_rules']
        if name in BETA_SPAWNS:
            if name in ('ghast', 'zombie_pigman'):
                # Beta's nether is one biome: let both spawn in every nether biome
                for c in rules['conditions']:
                    c['minecraft:biome_filter'] = {'test': 'has_biome_tag', 'operator': '==', 'value': 'nether'}
            else:
                continue  # vanilla rule unchanged
        else:
            rules['conditions'] = []
        write(os.path.join(out, fn), d)
        n += 1
    print('spawn rules overridden:', n)


if __name__ == '__main__':
    recipes()
    loot()
    spawn_rules()
