#!/bin/bash
set -e

cd /Users/cpres/git/gardensteward/steward-bank

echo "Starting interactive rebase to fix secrets..."

# Start rebase, marking the problematic commit for editing
GIT_SEQUENCE_EDITOR="sed -i '' 's/^pick 35dc1e5/edit 35dc1e5/'" git rebase -i 79fbda1

# Now we should be at the commit to edit
echo "Fixing secrets in the file..."
sed -i '' 's/ya29\.a0ATi6K2t1am9MiYOGEZlEt1y2j33hzKu-_dEaVahMT27THvcnywmQ1XmzSCD-l-ziNGkZvGXxiE2UHGr7pFAOt8qZl7WMDwpOLGHtWVqMpaqAVwlEEhWZFmyr7H_ZU2VCKyXaxt20VWx89Rr7Sj2flPBpDLY9F3FDL1xQyNbpnIiHPCd0AwVjVGpz1aUkRkEk2vcgq0EaCgYKAQkSARISFQHGX2MiV91lkeNKDPsbaoeut7Q2Dw0206/YOUR_ACCESS_TOKEN_HERE/g' ai_docs/GOOGLE_PHOTOS_TOKEN_STORAGE.md
sed -i '' 's/1\/\/06SQ3uBNbNhcUCgYIARAAGAYSNwF-L9IrNUSTxef5BwuQ33RpPWL3xungJuo4owUZL-PjlcwRZzKoQYtXTju4qMxptilk-0LcmfA/YOUR_REFRESH_TOKEN_HERE/g' ai_docs/GOOGLE_PHOTOS_TOKEN_STORAGE.md

echo "Staging fixed file..."
git add ai_docs/GOOGLE_PHOTOS_TOKEN_STORAGE.md

echo "Amending commit..."
git commit --amend --no-edit

echo "Continuing rebase..."
git rebase --continue

echo "Done! Secrets have been removed from commit history."

