#!/bin/bash
# This script will be used to automate the rebase fix
sed -i '' 's/^pick 35dc1e5/edit 35dc1e5/' "$1"

