# Earlier full port (not built)

The Beta gameplay layer that used to ship with the terrain, set aside when the add-on was cut down to terrain only
(Minecraft 1.26.60 crashed natively while loading worlds that had it):

- `scripts/mechanics.js`: no hunger, instant food, Beta bow, wool from hitting sheep, no breeding, script-spawned
  wolves and slimes.
- `tools/build_bp.py`: recipes (vanilla ones retagged off, Beta's 151 crafting + 10 smelting added), mob loot
  tables and spawn rules, written to `BP/`.
- `tools/build_rp.py`, `tools/build_entities.py`: a resource pack built from the jar's textures (with the TextureFX
  water/lava/fire/portal animations, HUD, sky, fog, font and mob models), written to `RP/`; `png` / `tga` /
  `brarchive` are their helpers.

`RP/` and `BP/` are generated from the b1.7.3 jar and Bedrock's vanilla packs, so they are not in the repository.
The tools resolve paths from their own folder: move them back into `../tools` to run them. Much of this overrides
vanilla files from Bedrock 1.26.52 and would need refreshing for newer versions.
