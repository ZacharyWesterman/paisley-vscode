#!/usr/bin/env bash

cd server/out || exit 1
mkdir -p build || exit 1
cd build || exit 1

version=v1.15.16
# Download the paisley compiler for both Linux and Windows
for i in paisley paisley.exe; do
    echo "Downloading $i..."
    url=https://github.com/ZacharyWesterman/paisley/releases/download/$version/$i
    wget $url --quiet || {
        echo "Failed to download $i"
        exit 1
    }
    chmod +x $i || {
        echo "Failed to make $i executable"
        exit 1
    }
done
