# Beta 1.7.3 terrain for Minecraft Bedrock

A Bedrock add-on that generates worlds with the **Minecraft Beta 1.7.3 world generator**: the same seed gives the
same world as Beta, block for block, at the same coordinates, in the overworld and the Nether.

> Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.

## Playing

1. Download `Beta 1.7.3.mcaddon` from the releases page (or build it, below) and open it; Minecraft imports a
   behavior pack and a world template. Bedrock 1.26.50 or newer.
2. Create a world from the **Beta 1.7.3** template (Create New → Templates). If the template does not show up,
   import `Beta 1.7.3 World.mctemplate` on its own.
3. On first join a form asks for the seed. It follows Beta's create-world rule: a number is used as is, any other
   text uses Java's `String.hashCode()`, and a blank field picks a random seed. You spawn where Beta would put you.

Commands (no cheats needed): `/b173:seed`, `/b173:status`, `/b173:radius <2-16>` (chunks generated around players).

## What it does

The b1.7.3 overworld and Nether generators (noise, biomes, caves, ores, lakes, dungeons with their loot and
spawners, every tree type, plants, springs, snow), the chunk provider's populate order and the block updates it
triggers, run by script around players and written into a void world. Gameplay, textures and sounds are Bedrock's.

Scripts cannot set biomes, so the whole world is one Bedrock biome: grass colour is uniform and mob spawning follows
that biome.

## How it works

- `packs/BP/scripts/gen` is a JavaScript port of the b1.7.3 generator, written from the game's bytecode. Java's
  `Random`, float rounding, integer overflow (the Far Lands) and the order of every random call are reproduced, so
  the output is exact. It runs the same in Bedrock and in Node.
- `packs/BP/scripts/bedrock` generates chunks around players in a background job, writes each one as an in-memory
  structure placed in one call, fills dungeon chests and spawners, rebuilds the Nether arrival portal, and keeps
  players in place until the ground under them exists.
- Bedrock's script engine overflows at about a hundred nested calls (and its watchdog then closes the world), while
  Beta floods a cave from a spring by recursing once per block. Block callbacks are therefore generators run on an
  explicit stack (`GenWorld.run`), in exactly Beta's order.

## Building

Python 3 (standard library only):

```
python -I tools/package.py      # packs/BP and dist/: Beta 1.7.3.mcaddon, BP .mcpack, World .mctemplate
python -I tools/install.py      # Windows: install into the game's folders and update worlds using the pack
```

`install.py` targets the GDK version of Bedrock (`%APPDATA%\Minecraft Bedrock`); close Minecraft first.

## Checking it against Beta

This needs your own copy of the b1.7.3 client jar (SHA-1 `43db9b498cb67058d2e12d394e6507722e71bb45`), a JDK 21+
(`JAVA_HOME` or on `PATH`) and Node 18+:

```
python -I tools/setup.py path/to/b1.7.3.jar     # unpacks it into re/ and compiles tools/harness
node tools/verify.mjs world <seed> <x0> <z0> <x1> <z1> [worldRandSeed] [0|-1]
node --import ./tools/mock/loader.mjs tools/simtest.mjs [seed]
```

- `verify.mjs` runs the real generator from the jar (`tools/harness/Harness.java`) and the JS port on the same
  chunks and compares every block, metadata value and tile entity (`0` overworld, `-1` Nether).
- `simtest.mjs` runs the behavior pack against a mock of `@minecraft/server` (`tools/mock`), checks that what is
  written equals the generator's output, and fails if the generator's call stack gets deep. It needs no jar.

## Reverse engineering

- `tools/jp.py <class> [method]` prints javap bytecode (or `-g` Ghidra's decompilation) of one class;
  `tools/bc2java.py <class> [method]` turns bytecode into exact pseudo-Java (Ghidra's JVM output garbles doubles).
- `tools/ghidra.ps1 import | gui` builds a Ghidra project from `re/classes` and exports every class's
  decompilation to `re/decomp` (set `GHIDRA_INSTALL_DIR` and `JAVA_HOME`).
- `tools/crashdump.py [dump]` reads a Bedrock crash dump (`%LOCALAPPDATA%\CrashDumps\Minecraft.Windows.exe.*.dmp`)
  without a debugger: the exception, the crashing thread, the game functions on its stack (named by the strings
  they reference) and the text on the busy threads' stacks. Useful because the content log is not written on a
  crash.

## Layout

| Path | |
|---|---|
| `packs/BP` | the behavior pack (scripts, spawner structures, manifest) |
| `tools/template/level.dat` | the world template's level.dat: a void-flat overworld |
| `tools/package.py`, `install.py`, `make_structures.py`, `make_icon.py`, `gen_blockdata.py`, `nbt.py` | build |
| `tools/setup.py`, `harness/`, `verify.mjs`, `simtest.mjs`, `memtest.mjs`, `mock/` | checks |
| `gameplay/` | an earlier, larger version (Beta textures, recipes, mob drops, mechanics), not built |
