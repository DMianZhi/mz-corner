import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";

async function initEncryption(): Promise<void> {
  const { isPrivateDeployed, getGatewayUrl } = await import("./lib/private-env");
  if (!isPrivateDeployed()) return;

  const gatewayUrl = getGatewayUrl();
  const { fetchGatewayConfig, applyGatewayEncryptConfig } = await import("./lib/gateway-crypto");
  const { installFetchEncryption } = await import("./lib/fetch-encryption");

  const config = await fetchGatewayConfig(gatewayUrl);
  if (!config.encryption?.is_encryption) return;

  await applyGatewayEncryptConfig(config.encryption);
  installFetchEncryption(gatewayUrl);
}

initEncryption()
  .catch((err) => console.warn("[encryption] init failed, running without encryption:", err))
  .then(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
