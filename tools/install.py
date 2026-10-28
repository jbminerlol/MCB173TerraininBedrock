"""Installs the current build into the local Bedrock (GDK) data folders for testing:
  - the behavior pack into Users/Shared/games/com.mojang/behavior_packs, where importing the .mcaddon puts it
    (older copies in the development_* folders are removed so the game does not list the pack twice)
  - the world template into each user's world_templates/Beta1.7.3
  - every world that uses the Beta behavior pack gets the new pack and pack version (its save data is untouched)
The resource pack of earlier builds (Beta textures and gameplay) is removed everywhere, worlds included.
Run tools/package.py first; restart Minecraft afterwards if it was open.
"""
import glob
import json
import os
import shutil
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BEDROCK = os.path.join(os.environ['APPDATA'], 'Minecraft Bedrock', 'Users')
BP = os.path.join(ROOT, 'packs', 'BP')
TEMPLATE = os.path.join(ROOT, 'dist', 'Beta 1.7.3 World.mctemplate')
OLD_RP_UUID = '4dc7dd88-4719-49c1-9936-191017ad7998'
SKIP = {'package.json'}


def manifest(p):
    return json.load(open(os.path.join(p, 'manifest.json'), encoding='utf-8'))['header']


def replace_dir(src, dst):
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=lambda d, names: [n for n in names if n in SKIP])


def main():
    bp = manifest(BP)
    shared = os.path.join(BEDROCK, 'Shared', 'games', 'com.mojang')
    replace_dir(BP, os.path.join(shared, 'behavior_packs', 'Beta 1.7.3 BP'))
    for old in (os.path.join(shared, 'resource_packs', 'Beta 1.7.3 RP'),
                os.path.join(shared, 'development_behavior_packs', 'Beta 1.7.3 BP'),
                os.path.join(shared, 'development_resource_packs', 'Beta 1.7.3 RP')):
        if os.path.isdir(old):
            shutil.rmtree(old)
    print('pack ->', shared)
    for com in glob.glob(os.path.join(BEDROCK, '*', 'games', 'com.mojang')):
        templates = os.path.join(com, 'world_templates')
        if os.path.isdir(templates):
            dst = os.path.join(templates, 'Beta1.7.3')
            if os.path.isdir(dst):
                shutil.rmtree(dst)
            os.makedirs(dst)
            zipfile.ZipFile(TEMPLATE).extractall(dst)
            print('template ->', dst)
        for w in glob.glob(os.path.join(com, 'minecraftWorlds', '*')):
            refs = os.path.join(w, 'world_behavior_packs.json')
            if not os.path.isfile(refs):
                continue
            try:
                packs = json.load(open(refs, encoding='utf-8'))
            except Exception:
                continue
            if not any(p.get('pack_id') == bp['uuid'] for p in packs):
                continue
            replace_dir(BP, os.path.join(w, 'behavior_packs', 'beta_1.7.3_bp'))
            with open(refs, 'w', encoding='utf-8') as f:
                json.dump([{'pack_id': bp['uuid'], 'version': bp['version']}], f, indent=4)
            old_rp = os.path.join(w, 'resource_packs', 'beta_1.7.3_rp')
            if os.path.isdir(old_rp):
                shutil.rmtree(old_rp)
            rrefs = os.path.join(w, 'world_resource_packs.json')
            if os.path.isfile(rrefs):
                try:
                    rp = [p for p in json.load(open(rrefs, encoding='utf-8')) if p.get('pack_id') != OLD_RP_UUID]
                except Exception:
                    rp = []
                with open(rrefs, 'w', encoding='utf-8') as f:
                    json.dump(rp, f, indent=4)
            name = open(os.path.join(w, 'levelname.txt'), encoding='utf-8').read().strip()
            print(f'world "{name}" ({os.path.basename(w)}) -> pack {bp["version"]}')


if __name__ == '__main__':
    running = 'Minecraft.Windows.exe' in os.popen('tasklist /FI "IMAGENAME eq Minecraft.Windows.exe"').read()
    main()
    if running:
        print('Minecraft is running: restart it so it picks up the new files')
