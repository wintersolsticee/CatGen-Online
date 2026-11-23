import { ENV } from "./env.ts";
import { startServer } from "./server.ts";

startServer({ port: ENV.port })
  .then((s) => {
    console.log(`[server] map loaded: ${s.map.name} (${s.map.width}x${s.map.height} tiles)`);
    console.log(`[server] CatGen Online listening on http://localhost:${s.port}`);
    const shutdown = async () => {
      console.log("[server] shutting down - saving players...");
      await s.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  })
  .catch((e) => {
    console.error("[server] fatal", e);
    process.exit(1);
  });
