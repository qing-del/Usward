#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
distribution_url=$(sed -n 's/^distributionUrl=//p' "$project_dir/.mvn/wrapper/maven-wrapper.properties")
if [ -z "$distribution_url" ]; then
  echo 'Maven Wrapper distributionUrl is missing' >&2
  exit 1
fi

archive_name=${distribution_url##*/}
distribution_name=${archive_name%-bin.zip}
distribution_root="${HOME}/.m2/wrapper/dists"
maven_bin="$distribution_root/$distribution_name/bin/mvn"

if [ ! -x "$maven_bin" ]; then
  mkdir -p "$distribution_root"
  archive_file=$(mktemp "${TMPDIR:-/tmp}/usward-maven.XXXXXX")
  trap 'rm -f "$archive_file"' EXIT HUP INT TERM
  curl --fail --location --silent --show-error "$distribution_url" --output "$archive_file"
  unzip -q "$archive_file" -d "$distribution_root"
  rm -f "$archive_file"
  trap - EXIT HUP INT TERM
fi

exec "$maven_bin" "$@"
