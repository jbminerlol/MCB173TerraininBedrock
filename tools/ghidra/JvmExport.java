// Ghidra post-analysis script for the b1.7.3 class files: writes the full decompilation of every
// method of the current class program to <output-dir>/<class>.c (one file per class).
//
// Args: <output-dir>
//@category B173
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileOptions;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;

import java.io.File;
import java.io.PrintWriter;

public class JvmExport extends GhidraScript {
    @Override
    public void run() throws Exception {
        File outDir = new File(getScriptArgs()[0]);
        outDir.mkdirs();
        String cls = currentProgram.getName().replaceAll("\\.class$", "");

        DecompInterface dec = new DecompInterface();
        DecompileOptions opts = new DecompileOptions();
        opts.grabFromProgram(currentProgram);
        dec.setOptions(opts);
        dec.toggleCCode(true);
        dec.setSimplificationStyle("decompile");
        dec.openProgram(currentProgram);

        try (PrintWriter w = new PrintWriter(new File(outDir, cls + ".c"), "UTF-8")) {
            w.println("// class " + cls);
            for (Function f : currentProgram.getFunctionManager().getFunctions(true)) {
                if (f.isExternal() || f.isThunk()) continue;
                w.println();
                w.println("// @" + f.getEntryPoint() + " " + f.getName(true));
                DecompileResults r = dec.decompileFunction(f, 180, monitor);
                if (r != null && r.decompileCompleted()) {
                    w.print(r.getDecompiledFunction().getC());
                } else {
                    w.println("// decompile failed: " + (r == null ? "null" : r.getErrorMessage()));
                }
            }
        }
        dec.dispose();
    }
}
