"""Prepares re/ from your own copy of the Minecraft Beta 1.7.3 client jar (not included in this repository):
  re/classes, re/assets     the jar's class files and other files, unpacked
  tools/harness/build       Harness.java compiled against them (tools/verify.mjs runs it)
  re/blocktable.txt         the Block / Material tables (tools/gen_blockdata.py turns them into blockdata.js)
  re/javap/all.txt          javap bytecode of every class (tools/jp.py, tools/bc2java.py)

  python -I tools/setup.py [path/to/b1.7.3.jar]       default: b173.jar in the project folder

Needs a JDK: JAVA_HOME, or javac / java / javap on PATH. Only building the add-on needs none of this.
"""
import hashlib
import os
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RE = os.path.join(ROOT, 're')
SHA1 = '43db9b498cb67058d2e12d394e6507722e71bb45'  # the b1.7.3 client.jar Mojang distributed


def tool(name):
    home = os.environ.get('JAVA_HOME')
    return os.path.join(home, 'bin', name) if home else name


def main():
    jar = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'b173.jar')
    if not os.path.isfile(jar):
        sys.exit(f'{jar} not found: copy the b1.7.3 client jar (versions/b1.7.3/b1.7.3.jar in a launcher) there')
    digest = hashlib.sha1(open(jar, 'rb').read()).hexdigest()
    if digest != SHA1:
        print(f'warning: {jar} has SHA-1 {digest}, not the b1.7.3 client jar ({SHA1}); the comparison may fail')
    classes, assets = os.path.join(RE, 'classes'), os.path.join(RE, 'assets')
    names = []
    with zipfile.ZipFile(jar) as z:
        for info in z.infolist():
            if info.is_dir() or info.filename.startswith('META-INF/'):
                continue
            is_class = info.filename.endswith('.class')
            dst = os.path.join(classes if is_class else assets, *info.filename.split('/'))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, 'wb') as f:
                f.write(z.read(info))
            if is_class:
                names.append(info.filename[:-6].replace('/', '.'))
    print(f'unpacked {len(names)} classes to re/classes, the rest to re/assets')
    build = os.path.join(ROOT, 'tools', 'harness', 'build')
    os.makedirs(build, exist_ok=True)
    subprocess.run([tool('javac'), '-nowarn', '-cp', classes, '-d', build,
                    os.path.join(ROOT, 'tools', 'harness', 'Harness.java')], check=True)
    cp = os.pathsep.join([classes, assets, build])
    subprocess.run([tool('java'), '-cp', cp, 'Harness', 'tables', os.path.join(RE, 'blocktable.txt')], check=True)
    print('compiled the harness, wrote re/blocktable.txt')
    os.makedirs(os.path.join(RE, 'javap'), exist_ok=True)
    game = sorted(n for n in names if '.' not in n)  # the obfuscated game classes; the rest are bundled libraries
    with open(os.path.join(RE, 'javap', 'all.txt'), 'w', encoding='utf-8') as f:
        subprocess.run([tool('javap'), '-c', '-p', '-s', '-constants', '-cp', classes, *game], stdout=f, check=True)
    print('wrote re/javap/all.txt')


if __name__ == '__main__':
    main()
