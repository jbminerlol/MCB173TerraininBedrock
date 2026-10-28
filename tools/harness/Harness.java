// Runs the real b1.7.3 world generator (classes from b173.jar, obfuscated names) headlessly so the JS port in
// packs/BP/scripts/gen can be compared against it block for block.
//
//   java -cp <classes>;<build> Harness tables <out.txt>
//   java -cp ... Harness sin <out.bin>                                  MathHelper sine table (65536 floats, BE)
//   java -cp ... Harness raw <seed> <out.bin> cx,cz [cx,cz ...]         unpopulated chunks (yf.b)
//   java -cp ... Harness world <seed> <worldRandSeed> <x0> <z0> <x1> <z1> <out.bin> [dimension: 0 or -1]
//        loads every chunk of the rectangle in row-major order (x outer) through the game's own ChunkProvider,
//        which populates as neighbours appear, then dumps every chunk the provider holds.
//
// Chunk records: int cx, int cz, byte populated, byte[32768] blocks, byte[16384] meta, byte[16384] skylight,
// byte[256] heightmap.
import java.io.*;
import java.lang.reflect.Field;
import java.util.*;

public class Harness {
    static class NullLoader implements bf {
        public lm a(fd w, int x, int z) { return null; }
        public void a(fd w, lm c) {}
        public void b(fd w, lm c) {}
        public void a() {}
        public void b() {}
    }

    static class NullSave implements wt {
        public ei c() { return null; }
        public void b() {}
        public bf a(xa p) { return new NullLoader(); }
        public void a(ei i, List l) {}
        public void a(ei i) {}
        public File a(String s) { return null; }
    }

    static fd newWorld(long seed) {
        return new fd(new NullSave(), "harness", xa.a(0), seed);
    }

    static void writeChunk(DataOutputStream out, lm c) throws IOException {
        out.writeInt(c.j);
        out.writeInt(c.k);
        out.writeByte(c.n ? 1 : 0);
        out.write(c.b);
        out.write(c.e.a);
        out.write(c.f.a);
        out.write(c.h);
    }

    public static void main(String[] args) throws Exception {
        String mode = args[0];
        if (mode.equals("tables")) {
            tables(args[1]);
        } else if (mode.equals("sin")) {
            Field f = in.class.getDeclaredField("a");
            f.setAccessible(true);
            float[] t = (float[]) f.get(null);
            try (DataOutputStream out = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(args[1])))) {
                for (float v : t) out.writeFloat(v);
            }
        } else if (mode.equals("spawn")) {
            // World.c() with a seeded world Random, as the add-on does
            for (int i = 1; i < args.length; i++) {
                long seed = Long.parseLong(args[i]);
                fd w = newWorld(seed);
                w.r = new Random(seed);
                w.c();
                System.out.println(seed + " " + w.x.c() + " " + w.x.d() + " " + w.x.e());
            }
        } else if (mode.equals("hash")) {
            for (int i = 1; i < args.length; i++) System.out.println(args[i].hashCode());
        } else if (mode.equals("recipes")) {
            recipes(args[1]);
        } else if (mode.equals("raw")) {
            long seed = Long.parseLong(args[1]);
            fd w = newWorld(seed);
            yf gen = new yf(w, seed);
            try (DataOutputStream out = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(args[2])))) {
                for (int i = 3; i < args.length; i++) {
                    String[] p = args[i].split(",");
                    writeChunk(out, gen.b(Integer.parseInt(p[0]), Integer.parseInt(p[1])));
                }
            }
        } else if (mode.equals("world")) {
            long seed = Long.parseLong(args[1]);
            int dim = args.length > 8 ? Integer.parseInt(args[8]) : 0;
            fd w = new fd(new NullSave(), "harness", xa.a(dim), seed);
            w.r = new Random(Long.parseLong(args[2]));
            int x0 = Integer.parseInt(args[3]), z0 = Integer.parseInt(args[4]);
            int x1 = Integer.parseInt(args[5]), z1 = Integer.parseInt(args[6]);
            long t0 = System.nanoTime();
            for (int x = x0; x <= x1; x++)
                for (int z = z0; z <= z1; z++)
                    w.c(x, z);
            System.err.println("generated in " + (System.nanoTime() - t0) / 1000000 + " ms");
            Field fm = ok.class.getDeclaredField("e");
            fm.setAccessible(true);
            Field fp = fd.class.getDeclaredField("v");
            fp.setAccessible(true);
            Map m = (Map) fm.get(fp.get(w));
            List<lm> chunks = new ArrayList<>();
            for (Object o : m.values()) chunks.add((lm) o);
            chunks.sort((a, b) -> a.j != b.j ? Integer.compare(a.j, b.j) : Integer.compare(a.k, b.k));
            try (DataOutputStream out = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(args[7])))) {
                out.writeInt(chunks.size());
                for (lm c : chunks) writeChunk(out, c);
                // tile entities: x y z class [extra]
                StringBuilder te = new StringBuilder();
                for (lm c : chunks) {
                    for (Object o : c.l.values()) te.append(describeTile((ow) o)).append('\n');
                }
                byte[] tb = te.toString().getBytes("UTF-8");
                out.writeInt(tb.length);
                out.write(tb);
            }
        }
    }

    static String describeTile(ow t) throws Exception {
        StringBuilder sb = new StringBuilder();
        sb.append(t.e).append(' ').append(t.f).append(' ').append(t.g).append(' ').append(t.getClass().getName());
        for (Field f : t.getClass().getDeclaredFields()) {
            if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
            f.setAccessible(true);
            Object v = f.get(t);
            if (v instanceof String) sb.append(" s=").append(v);
            else if (v instanceof Object[]) {
                for (Object it : (Object[]) v) {
                    if (it == null) { sb.append(" -"); continue; }
                    iz s = (iz) it;
                    sb.append(' ').append(s.c).append(':').append(s.a).append(':').append(s.i());
                }
            }
        }
        return sb.toString();
    }

    static String stack(iz s) {
        return s == null ? "null" : "[" + s.c + "," + s.a + "," + s.i() + "]";
    }

    // one JSON object per line: {"class":..., "ints":{...}, "stacks":{field:[...]}} for crafting, then smelting
    static void recipes(String outPath) throws Exception {
        Object blocksFirst = uu.m; // Block.<clinit> must run before CraftingManager's (as in the game)
        try (PrintWriter w = new PrintWriter(outPath, "UTF-8")) {
            for (Object r : hk.a().b()) {
                StringBuilder sb = new StringBuilder("{\"class\":\"" + r.getClass().getName() + "\"");
                for (Field f : r.getClass().getDeclaredFields()) {
                    if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
                    f.setAccessible(true);
                    Object v = f.get(r);
                    sb.append(",\"").append(f.getName()).append("\":");
                    if (v instanceof Integer) sb.append(v);
                    else if (v instanceof iz) sb.append(stack((iz) v));
                    else if (v instanceof iz[]) {
                        sb.append('[');
                        iz[] a = (iz[]) v;
                        for (int i = 0; i < a.length; i++) sb.append(i > 0 ? "," : "").append(stack(a[i]));
                        sb.append(']');
                    } else if (v instanceof List) {
                        sb.append('[');
                        List l = (List) v;
                        for (int i = 0; i < l.size(); i++) sb.append(i > 0 ? "," : "").append(stack((iz) l.get(i)));
                        sb.append(']');
                    } else sb.append("null");
                }
                w.println(sb.append('}'));
            }
            Map m = ey.a().b();
            for (Object k : m.keySet()) w.println("{\"class\":\"smelt\",\"in\":" + k + ",\"out\":" + stack((iz) m.get(k)) + "}");
        }
    }

    static void tables(String outPath) throws Exception {
        Field[] mats = ln.class.getDeclaredFields();
        Map<Object, String> matName = new HashMap<>();
        for (Field f : mats) {
            if (java.lang.reflect.Modifier.isStatic(f.getModifiers()) && f.getType() == ln.class) {
                matName.put(f.get(null), f.getName());
            }
        }
        try (PrintWriter w = new PrintWriter(outPath, "UTF-8")) {
            w.println("# id class material opaque(o) opacity(q) light(s) n p r t | mat: solid(a) grass(b) blocks(c) liquid(d) opaque(h) replaceable(g) burns(e) | block: opaqueCube(c) normal(d) | name");
            for (int i = 0; i < 256; i++) {
                uu b = uu.m[i];
                if (b == null) continue;
                ln m = b.bA;
                w.printf("%d %s %s %d %d %d %d %d %d %d | %d %d %d %d %d %d %d | %d %d | %s%n", i, b.getClass().getName(), matName.get(m),
                    uu.o[i] ? 1 : 0, uu.q[i], uu.s[i], uu.n[i] ? 1 : 0, uu.p[i] ? 1 : 0, uu.r[i] ? 1 : 0, uu.t[i] ? 1 : 0,
                    m.a() ? 1 : 0, m.b() ? 1 : 0, m.c() ? 1 : 0, m.d() ? 1 : 0, m.h() ? 1 : 0, m.g() ? 1 : 0, m.e() ? 1 : 0,
                    b.c() ? 1 : 0, b.d() ? 1 : 0, b.n());
            }
        }
    }
}
