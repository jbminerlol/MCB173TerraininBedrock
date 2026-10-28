"""Builds everything and packages dist/:
  Beta 1.7.3.mcaddon          behavior pack + world template (double-click to import)
  Beta 1.7.3 BP.mcpack / World.mctemplate   the same pieces on their own

The world template is a void-flat overworld (the script writes Beta terrain into it) with Bedrock's default game
rules, except spawn radius 0 so players appear exactly at Beta's spawn point.
"""
import io
import json
import os
import shutil
import subprocess
import sys
import uuid
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nbt  # noqa: E402
from nbt import Byte, Int, Float, Long, List, INT  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = os.path.join(ROOT, 'packs')
DIST = os.path.join(ROOT, 'dist')
TEMPLATE_UUID = '2be0a811-b35c-4cbe-8caa-78fa21babc87'
TEMPLATE_MODULE_UUID = 'c6f4f3a4-4b8f-4d65-9c1e-7d2a3b173b17'
VERSION = [1, 1, 0]
ENGINE = [1, 26, 50]
SKIP = {'package.json'}


def run(script):
    subprocess.run([sys.executable, '-I', os.path.join(ROOT, 'tools', script)], check=True)


def manifest(path):
    return json.load(open(os.path.join(path, 'manifest.json'), encoding='utf-8'))


def zip_dir(src, zf, prefix=''):
    for dirpath, dirs, files in os.walk(src):
        dirs.sort()
        for fn in sorted(files):
            if fn in SKIP:
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, src).replace(os.sep, '/')
            zf.write(full, prefix + rel)


def pack_bytes(src):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zip_dir(src, zf)
    return buf.getvalue()


def level_dat():
    version, root = nbt.read_level_dat(os.path.join(ROOT, 'tools', 'template', 'level.dat'))
    for k in ('prid', 'worldTemplateUUID', 'worldTemplateVersion', 'BiomeOverride', 'ConfirmedPlatformLockedContent',
              'isFromLockedTemplate', 'isWorldTemplateOptionLocked', 'daylightCycle'):
        root.pop(k, None)
    rules = {  # Bedrock's defaults
        'commandblockoutput': 1, 'commandblocksenabled': 1, 'dodaylightcycle': 1, 'doentitydrops': 1, 'dofiretick': 1,
        'doimmediaterespawn': 0, 'doinsomnia': 1, 'dolimitedcrafting': 0, 'domobloot': 1, 'domobspawning': 1,
        'dotiledrops': 1, 'doweathercycle': 1, 'drowningdamage': 1, 'falldamage': 1, 'firedamage': 1, 'freezedamage': 1,
        'keepinventory': 0, 'mobgriefing': 1, 'naturalregeneration': 1, 'projectilescanbreakblocks': 1, 'pvp': 1,
        'recipesunlock': 1, 'respawnblocksexplode': 1, 'sendcommandfeedback': 1, 'showcoordinates': 0,
        'showdeathmessages': 1, 'showrecipemessages': 1, 'tntexplodes': 1, 'tntexplosiondropdecay': 1,
        'showbordereffect': 1, 'showtags': 1, 'locatorbar': 1, 'spawnMobs': 1, 'commandsEnabled': 0, 'cheatsEnabled': 0,
        'bonusChestEnabled': 0, 'bonusChestSpawned': 0, 'hasBeenLoadedInCreative': 0, 'isFromWorldTemplate': 1,
        'isRandomSeedAllowed': 1, 'texturePacksRequired': 0, 'hasLockedBehaviorPack': 0, 'hasLockedResourcePack': 0,
        'immutableWorld': 0, 'isSingleUseWorld': 0, 'startWithMapEnabled': 0, 'PlayerHasDied': 0,
    }
    for k, v in rules.items():
        root[k] = Byte(v)
    root['randomtickspeed'] = Int(1)
    root['spawnradius'] = Int(0)  # Beta's exact spawn point
    root['playerssleepingpercentage'] = Int(100)
    root['functioncommandlimit'] = Int(10000)
    root['maxcommandchainlength'] = Int(65536)
    root['GameType'] = Int(0)
    root['Difficulty'] = Int(2)
    root['Generator'] = Int(2)
    root['FlatWorldLayers'] = json.dumps({'biome_id': 1, 'block_layers': [{'block_data': 0, 'block_name': 'minecraft:air', 'count': 1}],
                                          'encoding_version': 4, 'preset_id': None, 'structure_options': None},
                                         separators=(',', ':')) + '\n'
    root['LevelName'] = 'Beta 1.7.3'
    root['RandomSeed'] = Long(0)
    root['SpawnX'], root['SpawnY'], root['SpawnZ'] = Int(0), Int(64), Int(0)
    root['Time'] = Long(0)
    root['currentTick'] = Long(0)
    root['LastPlayed'] = Long(0)
    root['worldStartCount'] = Long(0)
    root['baseGameVersion'] = '.'.join(str(v) for v in ENGINE)
    root['MinimumCompatibleClientVersion'] = List(INT, [Int(v) for v in ENGINE] + [Int(0), Int(0)])
    root['lastOpenedWithVersion'] = List(INT, [Int(1), Int(26), Int(52), Int(0), Int(0)])
    root['permissionsLevel'] = Int(0)
    root['playerPermissionsLevel'] = Int(1)
    root['abilities'] = {
        'attackmobs': Byte(1), 'attackplayers': Byte(1), 'build': Byte(1), 'doorsandswitches': Byte(1),
        'flySpeed': Float(0.05000000074505806), 'flying': Byte(0), 'instabuild': Byte(0), 'invulnerable': Byte(0),
        'lightning': Byte(0), 'mayfly': Byte(0), 'mine': Byte(1), 'op': Byte(0), 'opencontainers': Byte(1),
        'teleport': Byte(0), 'verticalFlySpeed': Float(1.0), 'walkSpeed': Float(0.10000000149011612),
    }
    root['experiments'] = {'experiments_ever_used': Byte(0), 'saved_with_toggled_experiments': Byte(0)}
    body = nbt.dumps(root)
    import struct
    return struct.pack('<ii', version, len(body)) + body


def world_template(bp):
    bpm = manifest(bp)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('manifest.json', json.dumps({
            'format_version': 2,
            'header': {'name': 'Beta 1.7.3', 'description': 'A Minecraft Beta 1.7.3 world: the original b1.7.3 world generator, same seed, same world.',
                       'uuid': TEMPLATE_UUID, 'version': VERSION, 'lock_template_options': False, 'base_game_version': ENGINE},
            'modules': [{'type': 'world_template', 'uuid': TEMPLATE_MODULE_UUID, 'version': VERSION}],
        }, indent=4))
        zf.writestr('level.dat', level_dat())
        zf.writestr('levelname.txt', 'Beta 1.7.3')
        zf.writestr('world_behavior_packs.json', json.dumps([{'pack_id': bpm['header']['uuid'], 'version': bpm['header']['version']}], indent=4))
        zf.writestr('world_resource_packs.json', '[]')
        zf.writestr('texts/en_US.lang', 'pack.name=Beta 1.7.3\npack.description=Minecraft Beta 1.7.3 terrain on Bedrock\n')
        zf.writestr('texts/languages.json', '["en_US"]')
        zip_dir(bp, zf, 'behavior_packs/beta_1.7.3_bp/')
    return buf.getvalue()


def main():
    # blockdata.js is checked in; it is only regenerated when tools/setup.py has dumped the jar's tables
    if os.path.exists(os.path.join(ROOT, 're', 'blocktable.txt')):
        run('gen_blockdata.py')
    for s in ('make_structures.py', 'make_icon.py'):
        run(s)
    bp = os.path.join(PACKS, 'BP')
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)
    files = {'Beta 1.7.3 BP.mcpack': pack_bytes(bp), 'Beta 1.7.3 World.mctemplate': world_template(bp)}
    for name, data in files.items():
        open(os.path.join(DIST, name), 'wb').write(data)
    with zipfile.ZipFile(os.path.join(DIST, 'Beta 1.7.3.mcaddon'), 'w', zipfile.ZIP_STORED) as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    for name in sorted(os.listdir(DIST)):
        print(f'{os.path.getsize(os.path.join(DIST, name)) / 1024:9.0f} KB  dist/{name}')


if __name__ == '__main__':
    main()
