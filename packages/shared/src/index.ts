export interface DesktopInfo {
  readonly name: string;
  readonly version: string;
}

export function releaseVersionFromTag(tag: string): string {
  const match = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(tag);
  const version = match?.[1];
  if (version === undefined || tag !== `v${version}`) {
    throw new Error(`Expected a stable release tag in the form vX.Y.Z, received ${tag}`);
  }
  return version;
}
