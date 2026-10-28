"""Writes packs/BP/structures/b173/spawner_<mob>.mcstructure: a single mob spawner with Beta's settings
(TileEntityMobSpawner: 200-799 tick delay, 4 tries within 4 blocks, at most 6 nearby, player within 16)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nbt import Byte, Short, Int, Float, List, dumps, INT, COMPOUND, LIST  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLOCK_VERSION = 18100737  # 1.20.0.1 block state format; the game upgrades it on load

MOBS = {'zombie': 'minecraft:zombie', 'skeleton': 'minecraft:skeleton', 'spider': 'minecraft:spider', 'pig': 'minecraft:pig'}


def spawner(entity):
    return {
        'format_version': Int(1),
        'size': List(INT, [Int(1), Int(1), Int(1)]),
        'structure': {
            'block_indices': List(LIST, [List(INT, [Int(0)]), List(INT, [Int(-1)])]),
            'entities': List(COMPOUND, []),
            'palette': {
                'default': {
                    'block_palette': List(COMPOUND, [{'name': 'minecraft:mob_spawner', 'states': {}, 'version': Int(BLOCK_VERSION)}]),
                    'block_position_data': {
                        '0': {
                            'block_entity_data': {
                                'id': 'MobSpawner',
                                'isMovable': Byte(1),
                                'x': Int(0), 'y': Int(0), 'z': Int(0),
                                'EntityIdentifier': entity,
                                'Delay': Short(20),
                                'MinSpawnDelay': Short(200),
                                'MaxSpawnDelay': Short(799),
                                'SpawnCount': Short(4),
                                'MaxNearbyEntities': Short(6),
                                'RequiredPlayerRange': Short(16),
                                'SpawnRange': Short(4),
                                'DisplayEntityHeight': Float(1.8),
                                'DisplayEntityWidth': Float(0.8),
                                'DisplayEntityScale': Float(1.0),
                            }
                        }
                    },
                }
            },
        },
        'structure_world_origin': List(INT, [Int(0), Int(0), Int(0)]),
    }


def main():
    out = os.path.join(ROOT, 'packs', 'BP', 'structures', 'b173')
    os.makedirs(out, exist_ok=True)
    for name, entity in MOBS.items():
        with open(os.path.join(out, f'spawner_{name}.mcstructure'), 'wb') as f:
            f.write(dumps(spawner(entity)))
    print('wrote', len(MOBS), 'spawner structures to', out)


if __name__ == '__main__':
    main()
