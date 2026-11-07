/**
 * The archive file name for a package without its version, as `pnpm pack` names it:
 * `@kevinjohn/adonisjs-account-kit` becomes `kevinjohn-adonisjs-account-kit.tgz`.
 */
export function unversionedAssetName(packageName: string): string {
  return `${packageName.replace(/^@/, '').replace('/', '-')}.tgz`
}

/**
 * The release asset name, such as `kevinjohn-adonisjs-account-kit-0.3.1.tgz`.
 */
export function assetName(packageName: string, version: string): string {
  return unversionedAssetName(packageName).replace(/\.tgz$/, `-${version}.tgz`)
}

/**
 * The download URL of a package's release asset on GitHub.
 */
export function releaseAssetUrl(repository: string, packageName: string, version: string): string {
  return `https://github.com/${repository}/releases/download/v${version}/${assetName(packageName, version)}`
}

/**
 * The part of a package name after `@kevinjohn/adonisjs-`, used in labels and folder names.
 */
export function shortName(packageName: string): string {
  return packageName.replace(/^@kevinjohn\/adonisjs-/, '')
}
