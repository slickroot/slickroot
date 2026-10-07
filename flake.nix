{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    types-node = {
      url = "https://registry.npmjs.org/@types/node/-/node-24.19.1.tgz";
      flake = false;
    };
    undici-types = {
      url = "https://registry.npmjs.org/undici-types/-/undici-types-7.24.6.tgz";
      flake = false;
    };
  };

  outputs = { nixpkgs, types-node, undici-types, ... }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs:
        let
          nodeTypes = pkgs.runCommand "node-types" { } ''
            mkdir -p $out/node_modules/@types
            ln -s ${types-node} $out/node_modules/@types/node
            ln -s ${undici-types} $out/node_modules/undici-types
          '';
        in
        {
          default = pkgs.mkShell {
            packages = [ pkgs.nodejs_24 pkgs.pnpm pkgs.typescript ];
            NODE_TYPE_ROOTS = "${nodeTypes}/node_modules/@types";
          };
        });
    };
}
