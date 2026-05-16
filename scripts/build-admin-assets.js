const esbuild = require("esbuild");
const path = require("path");

const root = path.resolve(__dirname, "..");

async function build() {
  await esbuild.build({
    entryPoints: [path.join(root, "src", "admin", "admin.js")],
    outfile: path.join(root, "frontend", "js", "admin.secure.js"),
    bundle: true,
    minify: true,
    sourcemap: false,
    legalComments: "none",
    format: "iife",
    target: ["es2020"],
    charset: "utf8",
    define: {
      "process.env.NODE_ENV": '"production"'
    }
  });
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
