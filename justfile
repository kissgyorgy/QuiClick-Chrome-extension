mod extension

build:
    nix build .#default --out-link ./build/deploy

deploy: build
    #!/usr/bin/env bash
    link=./build/deploy
    nix copy --to ssh://nixstinger ${link}
    store_path=$(readlink -f ${link})
    ssh nixstinger "
      sudo ln -sfn ${store_path} /opt/quiclick/quiclick
      sudo systemctl restart quiclick
    "

restart:
    ssh nixstinger "sudo systemctl daemon-reload && sudo systemctl restart quiclick"
