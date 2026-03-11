{
  description = "TypeScript-enabled checking of CSS Modules";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      packages.${system} = {
        ts-css-modules-lint = pkgs.buildNpmPackage {
          pname = "ts-css-modules-lint";
          version = "1.0.0";

          src = ./.;

          npmDepsHash = "sha256-S4bezih08O3jFiyCLZpuz8uFHWtLcYYMqDnKzBrbLhM=";

          npmBuildScript = "build";

          dontNpmInstall = true;

          installPhase = ''
            runHook preInstall
            mkdir -p $out/lib/node_modules/ts-css-modules-lint
            cp -r build package.json node_modules $out/lib/node_modules/ts-css-modules-lint/
            mkdir -p $out/bin
            ln -s $out/lib/node_modules/ts-css-modules-lint/build/cli.js $out/bin/css-modules-lint
            runHook postInstall
          '';
        };

        default = self.packages.${system}.ts-css-modules-lint;
      };

      checks.${system} = {
        ts-css-modules-lint = self.packages.${system}.ts-css-modules-lint;
        devShell = self.devShells.${system}.default;
        tests = pkgs.buildNpmPackage {
          pname = "ts-css-modules-lint-tests";
          version = "1.0.0";

          src = ./.;

          npmDepsHash = "sha256-S4bezih08O3jFiyCLZpuz8uFHWtLcYYMqDnKzBrbLhM=";

          npmBuildScript = "build";

          doCheck = true;
          checkPhase = ''
            runHook preCheck
            npm test
            runHook postCheck
          '';

          installPhase = ''
            runHook preInstall
            touch $out
            runHook postInstall
          '';
        };
      };

      devShells.${system}.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          nodejs_22
          nodePackages.typescript
        ];
      };
    };
}
