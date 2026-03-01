{
  description = "QuiClick bookmark sync server";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    pyproject-nix = {
      url = "github:pyproject-nix/pyproject.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    uv2nix = {
      url = "github:pyproject-nix/uv2nix";
      inputs.pyproject-nix.follows = "pyproject-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    pyproject-build-systems = {
      url = "github:pyproject-nix/build-system-pkgs";
      inputs.pyproject-nix.follows = "pyproject-nix";
      inputs.uv2nix.follows = "uv2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, pyproject-nix, uv2nix, pyproject-build-systems, ... }:
    let
      inherit (nixpkgs) lib;
      forAllSystems = lib.genAttrs [ "x86_64-linux" ];

      workspace = uv2nix.lib.workspace.loadWorkspace { workspaceRoot = ./server; };

      overlay = workspace.mkPyprojectOverlay {
        sourcePreference = "wheel";
      };

      mkPythonSet =
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          python = pkgs.python312;
        in
        (pkgs.callPackage pyproject-nix.build.packages {
          inherit python;
        }).overrideScope
          (
            lib.composeManyExtensions [
              pyproject-build-systems.overlays.wheel
              overlay
            ]
          );
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          pythonSet = mkPythonSet system;
          venv = pythonSet.mkVirtualEnv "quiclick-env" workspace.deps.default;

        in
        {
          default = pkgs.writeShellApplication {
            name = "quiclick";
            runtimeInputs = [ venv ];
            text = builtins.replaceStrings [ "@server@" ] [ "${./server}" ]
              (builtins.readFile ./quiclick-ctl.sh);
          };
        }
      );
    };
}
