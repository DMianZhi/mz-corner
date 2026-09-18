/**
 * 私网部署环境检测与路径推导。
 *
 * 部署 URL 形如: {origin}/{gatewayPath}/{comatePrefix}/wpsgo/app/{projectId}/{appId}/
 * 例如: http://10.x.x.x:19003/qingzhou/wpsgo/app/4/ABC123/
 * 或:   https://10.x.x.x/path3/path4/qingzhou/wpsgo/app/4/ABC123/
 */

const WPSGO_MARKER = "/wpsgo/";

let _gatewayUrl: string | undefined;
let _isPrivate: boolean | undefined;

function parsePath() {
  if (typeof window === "undefined") return;
  const pathname = window.location.pathname;
  const idx = pathname.indexOf(WPSGO_MARKER);
  if (idx === -1) {
    _isPrivate = false;
    _gatewayUrl = "";
    return;
  }
  _isPrivate = true;
  const prefixWithComate = pathname.slice(0, idx);
  const lastSlash = prefixWithComate.lastIndexOf("/");
  const gatewayPath = lastSlash > 0 ? prefixWithComate.slice(0, lastSlash) : "";
  _gatewayUrl = window.location.origin + gatewayPath;
}

export function isPrivateDeployed(): boolean {
  if (_isPrivate === undefined) parsePath();
  return _isPrivate === true;
}

export function getGatewayUrl(): string {
  if (_gatewayUrl === undefined) parsePath();
  return _gatewayUrl || "";
}
