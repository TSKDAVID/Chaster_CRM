import dns from "node:dns";
import https from "node:https";
import path from "node:path";
import { URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import createHtmlPlugin from "vite-plugin-simple-html";
import { VitePWA } from "vite-plugin-pwa";

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

/**
 * When the OS stub resolver fails (ENOTFOUND), still try libc/Node DNS
 * against public nameservers. Many networks return NXDOMAIN/timeout only
 * from the corporate forwarder, while 8.8.8.8 / 1.1.1.1 answers correctly.
 */
async function resolveIPv4ViaPublicNameservers(
  hostname: string,
): Promise<string | null> {
  const prev = dns.getServers();
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4", "1.0.0.1"]);
    const addresses = await dns.promises.resolve4(hostname);
    const first = addresses[0] ?? null;
    return first;
  } catch {
    return null;
  } finally {
    try {
      dns.setServers(prev);
    } catch {
      /* ignore */
    }
  }
}

function supabaseBackendHostnameResolvable(backendUrl: string): boolean {
  let host: string;
  try {
    host = new URL(backendUrl).hostname;
  } catch {
    return false;
  }
  try {
    dns.lookupSync(host, { family: 4 });
    return true;
  } catch {
    try {
      dns.lookupSync(host, { family: 6 });
      return true;
    } catch {
      try {
        dns.lookupSync(host);
        return true;
      } catch {
        return false;
      }
    }
  }
}

/** DNS JSON Status 3 = NXDOMAIN (name does not exist). */
const DOH_DNS_STATUS_NXDOMAIN = 3;

/** When OS + public NS fail, resolve A via DoH (HTTPS 443; may work if only port 53 is filtered). */
async function resolveSupabaseIPv4ViaDoh(hostname: string): Promise<{
  ipv4: string | null;
  /** True when authoritative resolvers say the hostname does not exist. */
  nxdomain: boolean;
}> {
  let nxdomain = false;
  const urls = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
    `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=1`,
  ];
  for (const url of urls) {
    let uHost = "";
    try {
      uHost = new URL(url).hostname;
    } catch {
      uHost = "(bad_url)";
    }
    try {
      const res = await fetch(url, {
        headers: { accept: "application/dns-json" },
      });
      if (!res.ok) continue;
      const j = (await res.json()) as {
        Status?: number;
        Answer?: Array<{ type?: number; data?: string }>;
      };
      if (typeof j.Status === "number" && j.Status !== 0) {
        if (j.Status === DOH_DNS_STATUS_NXDOMAIN) nxdomain = true;
      }
      const a = j.Answer?.find(
        (x) => x.type === 1 && x.data && /^\d{1,3}(\.\d{1,3}){3}$/.test(x.data),
      );
      if (a?.data) return { ipv4: a.data, nxdomain: false };
    } catch {
      /* try next DoH endpoint */
    }
  }
  return { ipv4: null, nxdomain };
}

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = (env.VITE_SUPABASE_BACKEND_URL ?? "").replace(/\/+$/, "");
  const proxyRequested =
    mode === "development" &&
    env.VITE_SUPABASE_DEV_PROXY === "true" &&
    backend.length > 0;

  let canonicalHost = "";
  try {
    canonicalHost = new URL(backend).hostname;
  } catch {
    /* noop */
  }

  let dnsOk = proxyRequested ? supabaseBackendHostnameResolvable(backend) : false;
  let proxyTarget = backend;
  let useIpTarget = false;
  /** Set when DoH returns DNS NXDOMAIN (wrong or deleted Supabase project ref). */
  let hostnameNxdomain = false;

  if (proxyRequested && !dnsOk && canonicalHost) {
    console.warn(
      `\n[CRM] System DNS cannot resolve ${canonicalHost} (ENOTFOUND). Trying public DNS (8.8.8.8, 1.1.1.1), then DNS-over-HTTPS…`,
    );
    let ip = await resolveIPv4ViaPublicNameservers(canonicalHost);
    if (!ip) {
      const doh = await resolveSupabaseIPv4ViaDoh(canonicalHost);
      ip = doh.ipv4;
      hostnameNxdomain = doh.nxdomain;
    }
    if (ip) {
      dnsOk = true;
      useIpTarget = true;
      proxyTarget = `https://${ip}`;
      console.info(
        `[CRM] Dev proxy will use ${ip} with TLS SNI / Host ${canonicalHost}.\n`,
      );
    }
  }

  const useSupabaseProxy = proxyRequested && dnsOk;

  if (proxyRequested && !dnsOk) {
    if (hostnameNxdomain) {
      console.warn(
        "\n[CRM] Supabase dev proxy is disabled: this hostname does not exist in public DNS (NXDOMAIN).\n" +
          "    Your VITE_SUPABASE_URL / VITE_SUPABASE_BACKEND_URL project ref is wrong, or the project was removed.\n" +
          "    Fix: in Supabase Dashboard → Project Settings → API, copy the Project URL and update .env.\n" +
          "    Or use local Supabase: http://127.0.0.1:54321 and matching keys.\n",
      );
    } else {
      console.warn(
        "\n[CRM] Supabase dev proxy is disabled: could not resolve the backend host.\n" +
          "    Fix: OS DNS/VPN/firewall, run local Supabase (http://127.0.0.1:54321), or set VITE_SUPABASE_DEV_PROXY=false.\n",
      );
    }
  }

  const productionDefine =
    process.env.NODE_ENV === "production" && process.env.VITE_SUPABASE_URL
      ? {
          "import.meta.env.VITE_IS_DEMO": JSON.stringify(
            process.env.VITE_IS_DEMO,
          ),
          "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
            process.env.VITE_SUPABASE_URL,
          ),
          "import.meta.env.VITE_SB_PUBLISHABLE_KEY": JSON.stringify(
            process.env.VITE_SB_PUBLISHABLE_KEY,
          ),
          "import.meta.env.VITE_INBOUND_EMAIL": JSON.stringify(
            process.env.VITE_INBOUND_EMAIL,
          ),
        }
      : {};

  const developmentProxyDefine =
    mode === "development"
      ? {
          "import.meta.env.VITE_SUPABASE_PROXY_ACTIVE": JSON.stringify(
            useSupabaseProxy ? "true" : "false",
          ),
        }
      : {};

  const ipAgent =
    useSupabaseProxy && useIpTarget
      ? new https.Agent({
          servername: canonicalHost,
          rejectUnauthorized: true,
        })
      : undefined;

  return {
    plugins: [
      react(),
      tailwindcss(),
      visualizer({
        open: process.env.NODE_ENV !== "CI",
        filename: "./dist/stats.html",
      }),
      createHtmlPlugin({
        minify: true,
        inject: {
          data: {
            mainScript: `src/main.tsx`,
          },
        },
      }),
      VitePWA({
        registerType: "autoUpdate",
        devOptions: {
          enabled: false,
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
        },
        manifest: false, // Use existing manifest.json from public/
      }),
    ],
    server: {
      proxy: useSupabaseProxy
        ? {
            "/__supabase": {
              target: proxyTarget,
              changeOrigin: true,
              secure: true,
              ws: true,
              ...(ipAgent ? { agent: ipAgent } : {}),
              ...(useIpTarget
                ? {
                    configure: (proxy) => {
                      proxy.on("proxyReq", (proxyReq) => {
                        proxyReq.setHeader("Host", canonicalHost);
                      });
                    },
                  }
                : {}),
              rewrite: (pathStr) => {
                const next = pathStr.replace(/^\/__supabase/, "");
                return next.length ? next : "/";
              },
            },
          }
        : {},
    },
    define: { ...productionDefine, ...developmentProxyDefine },
    base: "./",
    esbuild: {
      keepNames: true,
    },
    build: {
      sourcemap: true,
    },
    resolve: {
      preserveSymlinks: true,
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
