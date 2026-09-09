const Module = require("module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (typeof request === "string" && (request === "server-only" || request.includes("server-only"))) {
    return {};
  }
  return originalLoad.apply(this, arguments);
};
