"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "proxy";
exports.ids = ["proxy"];
exports.modules = {

/***/ "(middleware)/./node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Fkartikarora%2FDocuments%2Fpersonal%2Ftraintickets%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Fkartikarora%2FDocuments%2Fpersonal%2Ftraintickets&matchers=&preferredRegion=&middlewareConfig=e30%3D!":
/*!****************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Fkartikarora%2FDocuments%2Fpersonal%2Ftraintickets%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Fkartikarora%2FDocuments%2Fpersonal%2Ftraintickets&matchers=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \****************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__),\n/* harmony export */   handler: () => (/* binding */ handler)\n/* harmony export */ });\n/* harmony import */ var next_dist_build_adapter_setup_node_env_external__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/build/adapter/setup-node-env.external */ \"next/dist/build/adapter/setup-node-env.external\");\n/* harmony import */ var next_dist_build_adapter_setup_node_env_external__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_build_adapter_setup_node_env_external__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_web_globals__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/web/globals */ \"(middleware)/./node_modules/next/dist/server/web/globals.js\");\n/* harmony import */ var next_dist_server_web_globals__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_web_globals__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var next_dist_server_web_adapter__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/web/adapter */ \"(middleware)/./node_modules/next/dist/server/web/adapter.js\");\n/* harmony import */ var next_dist_server_web_adapter__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_web_adapter__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var next_dist_server_lib_incremental_cache__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! next/dist/server/lib/incremental-cache */ \"(middleware)/./node_modules/next/dist/server/lib/incremental-cache/index.js\");\n/* harmony import */ var next_dist_server_lib_incremental_cache__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_incremental_cache__WEBPACK_IMPORTED_MODULE_3__);\n/* harmony import */ var _proxy_ts__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./proxy.ts */ \"(middleware)/./proxy.ts\");\n/* harmony import */ var next_dist_client_components_is_next_router_error__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! next/dist/client/components/is-next-router-error */ \"(middleware)/./node_modules/next/dist/client/components/is-next-router-error.js\");\n/* harmony import */ var next_dist_client_components_is_next_router_error__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(next_dist_client_components_is_next_router_error__WEBPACK_IMPORTED_MODULE_5__);\n/* harmony import */ var next_dist_server_web_utils__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! next/dist/server/web/utils */ \"(middleware)/./node_modules/next/dist/server/web/utils.js\");\n/* harmony import */ var next_dist_server_web_utils__WEBPACK_IMPORTED_MODULE_6___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_web_utils__WEBPACK_IMPORTED_MODULE_6__);\n\n\n\n\nconst incrementalCacheHandler = null\n// Import the userland code.\n;\n\n\n\nconst mod = {\n    ..._proxy_ts__WEBPACK_IMPORTED_MODULE_4__\n};\nconst page = \"/proxy\";\nconst isProxy = page === '/proxy' || page === '/src/proxy';\nconst handlerUserland = (isProxy ? mod.proxy : mod.middleware) || mod.default;\nclass ProxyMissingExportError extends Error {\n    constructor(message){\n        super(message);\n        // Stack isn't useful here, remove it considering it spams logs during development.\n        this.stack = '';\n    }\n}\n// TODO: This spams logs during development. Find a better way to handle this.\n// Removing this will spam \"fn is not a function\" logs which is worse.\nif (typeof handlerUserland !== 'function') {\n    throw new ProxyMissingExportError(`The ${isProxy ? 'Proxy' : 'Middleware'} file \"${page}\" must export a function named \\`${isProxy ? 'proxy' : 'middleware'}\\` or a default function.`);\n}\n// Proxy will only sent out the FetchEvent to next server,\n// so load instrumentation module here and track the error inside proxy module.\nfunction errorHandledHandler(fn) {\n    return async (...args)=>{\n        try {\n            return await fn(...args);\n        } catch (err) {\n            // In development, error the navigation API usage in runtime,\n            // since it's not allowed to be used in proxy as it's outside of react component tree.\n            if (true) {\n                if ((0,next_dist_client_components_is_next_router_error__WEBPACK_IMPORTED_MODULE_5__.isNextRouterError)(err)) {\n                    err.message = `Next.js navigation API is not allowed to be used in ${isProxy ? 'Proxy' : 'Middleware'}.`;\n                    throw err;\n                }\n            }\n            const req = args[0];\n            const url = new URL(req.url);\n            const resource = url.pathname + url.search;\n            await (0,next_dist_server_web_globals__WEBPACK_IMPORTED_MODULE_1__.edgeInstrumentationOnRequestError)(err, {\n                path: resource,\n                method: req.method,\n                headers: Object.fromEntries(req.headers.entries())\n            }, {\n                routerKind: 'Pages Router',\n                routePath: '/proxy',\n                routeType: 'proxy',\n                revalidateReason: undefined\n            });\n            throw err;\n        }\n    };\n}\nconst internalHandler = (opts)=>{\n    return (0,next_dist_server_web_adapter__WEBPACK_IMPORTED_MODULE_2__.adapter)({\n        ...opts,\n        IncrementalCache: next_dist_server_lib_incremental_cache__WEBPACK_IMPORTED_MODULE_3__.IncrementalCache,\n        incrementalCacheHandler,\n        page,\n        handler: errorHandledHandler(handlerUserland)\n    });\n};\nasync function handler(request, ctx) {\n    const result = await internalHandler({\n        request: {\n            url: request.url,\n            method: request.method,\n            headers: (0,next_dist_server_web_utils__WEBPACK_IMPORTED_MODULE_6__.toNodeOutgoingHttpHeaders)(request.headers),\n            nextConfig: {\n                basePath: \"\",\n                i18n: \"\",\n                trailingSlash: Boolean(false),\n                experimental: {\n                    cacheLife: {\"default\":{\"stale\":300,\"revalidate\":900,\"expire\":4294967294},\"seconds\":{\"stale\":30,\"revalidate\":1,\"expire\":60},\"minutes\":{\"stale\":300,\"revalidate\":60,\"expire\":3600},\"hours\":{\"stale\":300,\"revalidate\":3600,\"expire\":86400},\"days\":{\"stale\":300,\"revalidate\":86400,\"expire\":604800},\"weeks\":{\"stale\":300,\"revalidate\":604800,\"expire\":2592000},\"max\":{\"stale\":300,\"revalidate\":2592000,\"expire\":31536000}},\n                    authInterrupts: Boolean(false),\n                    clientParamParsingOrigins: []\n                }\n            },\n            page: {\n                name: page\n            },\n            body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body ?? undefined : undefined,\n            waitUntil: ctx.waitUntil,\n            requestMeta: ctx.requestMeta,\n            signal: ctx.signal || new AbortController().signal\n        }\n    });\n    ctx.waitUntil == null ? void 0 : ctx.waitUntil.call(ctx, result.waitUntil);\n    return result.response;\n}\n// backwards compat\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (internalHandler);\n\n//# sourceMappingURL=middleware.js.map\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKG1pZGRsZXdhcmUpLy4vbm9kZV9tb2R1bGVzL25leHQvZGlzdC9idWlsZC93ZWJwYWNrL2xvYWRlcnMvbmV4dC1taWRkbGV3YXJlLWxvYWRlci5qcz9hYnNvbHV0ZVBhZ2VQYXRoPSUyRlVzZXJzJTJGa2FydGlrYXJvcmElMkZEb2N1bWVudHMlMkZwZXJzb25hbCUyRnRyYWludGlja2V0cyUyRnByb3h5LnRzJnBhZ2U9JTJGcHJveHkmcm9vdERpcj0lMkZVc2VycyUyRmthcnRpa2Fyb3JhJTJGRG9jdW1lbnRzJTJGcGVyc29uYWwlMkZ0cmFpbnRpY2tldHMmbWF0Y2hlcnM9JnByZWZlcnJlZFJlZ2lvbj0mbWlkZGxld2FyZUNvbmZpZz1lMzAlM0QhIiwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUF5RDtBQUNuQjtBQUNpQjtBQUNtQjtBQUMxRTtBQUNBO0FBQ0EsQ0FBbUM7QUFDOEM7QUFDSTtBQUNkO0FBQ3ZFO0FBQ0EsT0FBTyxzQ0FBSTtBQUNYO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSw2Q0FBNkMsa0NBQWtDLFFBQVEsS0FBSyxtQ0FBbUMsaUNBQWlDO0FBQ2hLO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsVUFBVTtBQUNWO0FBQ0E7QUFDQSxnQkFBZ0IsSUFBcUM7QUFDckQsb0JBQW9CLG1HQUFpQjtBQUNyQyx5RkFBeUYsaUNBQWlDO0FBQzFIO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGtCQUFrQiwrRkFBaUM7QUFDbkQ7QUFDQTtBQUNBO0FBQ0EsYUFBYTtBQUNiO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsYUFBYTtBQUNiO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxXQUFXLHFFQUFPO0FBQ2xCO0FBQ0Esd0JBQXdCO0FBQ3hCO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQSxxQkFBcUIscUZBQXlCO0FBQzlDO0FBQ0EsMEJBQTBCLEVBQTRCO0FBQ3RELHNCQUFzQixFQUE4QjtBQUNwRCx1Q0FBdUMsS0FBaUM7QUFDeEU7QUFDQSwrQkFBK0IsMllBQTZCO0FBQzVELDRDQUE0QyxLQUErQztBQUMzRiwrQ0FBK0MsRUFBK0M7QUFDOUY7QUFDQSxhQUFhO0FBQ2I7QUFDQTtBQUNBLGFBQWE7QUFDYjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUVBQWUsZUFBZSxFQUFDOztBQUUvQiIsInNvdXJjZXMiOlsiIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBcIm5leHQvZGlzdC9idWlsZC9hZGFwdGVyL3NldHVwLW5vZGUtZW52LmV4dGVybmFsXCI7XG5pbXBvcnQgXCJuZXh0L2Rpc3Qvc2VydmVyL3dlYi9nbG9iYWxzXCI7XG5pbXBvcnQgeyBhZGFwdGVyIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvd2ViL2FkYXB0ZXJcIjtcbmltcG9ydCB7IEluY3JlbWVudGFsQ2FjaGUgfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9saWIvaW5jcmVtZW50YWwtY2FjaGVcIjtcbmNvbnN0IGluY3JlbWVudGFsQ2FjaGVIYW5kbGVyID0gbnVsbFxuLy8gSW1wb3J0IHRoZSB1c2VybGFuZCBjb2RlLlxuaW1wb3J0ICogYXMgX21vZCBmcm9tIFwiLi9wcm94eS50c1wiO1xuaW1wb3J0IHsgZWRnZUluc3RydW1lbnRhdGlvbk9uUmVxdWVzdEVycm9yIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvd2ViL2dsb2JhbHNcIjtcbmltcG9ydCB7IGlzTmV4dFJvdXRlckVycm9yIH0gZnJvbSBcIm5leHQvZGlzdC9jbGllbnQvY29tcG9uZW50cy9pcy1uZXh0LXJvdXRlci1lcnJvclwiO1xuaW1wb3J0IHsgdG9Ob2RlT3V0Z29pbmdIdHRwSGVhZGVycyB9IGZyb20gXCJuZXh0L2Rpc3Qvc2VydmVyL3dlYi91dGlsc1wiO1xuY29uc3QgbW9kID0ge1xuICAgIC4uLl9tb2Rcbn07XG5jb25zdCBwYWdlID0gXCIvcHJveHlcIjtcbmNvbnN0IGlzUHJveHkgPSBwYWdlID09PSAnL3Byb3h5JyB8fCBwYWdlID09PSAnL3NyYy9wcm94eSc7XG5jb25zdCBoYW5kbGVyVXNlcmxhbmQgPSAoaXNQcm94eSA/IG1vZC5wcm94eSA6IG1vZC5taWRkbGV3YXJlKSB8fCBtb2QuZGVmYXVsdDtcbmNsYXNzIFByb3h5TWlzc2luZ0V4cG9ydEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICAgIGNvbnN0cnVjdG9yKG1lc3NhZ2Upe1xuICAgICAgICBzdXBlcihtZXNzYWdlKTtcbiAgICAgICAgLy8gU3RhY2sgaXNuJ3QgdXNlZnVsIGhlcmUsIHJlbW92ZSBpdCBjb25zaWRlcmluZyBpdCBzcGFtcyBsb2dzIGR1cmluZyBkZXZlbG9wbWVudC5cbiAgICAgICAgdGhpcy5zdGFjayA9ICcnO1xuICAgIH1cbn1cbi8vIFRPRE86IFRoaXMgc3BhbXMgbG9ncyBkdXJpbmcgZGV2ZWxvcG1lbnQuIEZpbmQgYSBiZXR0ZXIgd2F5IHRvIGhhbmRsZSB0aGlzLlxuLy8gUmVtb3ZpbmcgdGhpcyB3aWxsIHNwYW0gXCJmbiBpcyBub3QgYSBmdW5jdGlvblwiIGxvZ3Mgd2hpY2ggaXMgd29yc2UuXG5pZiAodHlwZW9mIGhhbmRsZXJVc2VybGFuZCAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHRocm93IG5ldyBQcm94eU1pc3NpbmdFeHBvcnRFcnJvcihgVGhlICR7aXNQcm94eSA/ICdQcm94eScgOiAnTWlkZGxld2FyZSd9IGZpbGUgXCIke3BhZ2V9XCIgbXVzdCBleHBvcnQgYSBmdW5jdGlvbiBuYW1lZCBcXGAke2lzUHJveHkgPyAncHJveHknIDogJ21pZGRsZXdhcmUnfVxcYCBvciBhIGRlZmF1bHQgZnVuY3Rpb24uYCk7XG59XG4vLyBQcm94eSB3aWxsIG9ubHkgc2VudCBvdXQgdGhlIEZldGNoRXZlbnQgdG8gbmV4dCBzZXJ2ZXIsXG4vLyBzbyBsb2FkIGluc3RydW1lbnRhdGlvbiBtb2R1bGUgaGVyZSBhbmQgdHJhY2sgdGhlIGVycm9yIGluc2lkZSBwcm94eSBtb2R1bGUuXG5mdW5jdGlvbiBlcnJvckhhbmRsZWRIYW5kbGVyKGZuKSB7XG4gICAgcmV0dXJuIGFzeW5jICguLi5hcmdzKT0+e1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IGZuKC4uLmFyZ3MpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIC8vIEluIGRldmVsb3BtZW50LCBlcnJvciB0aGUgbmF2aWdhdGlvbiBBUEkgdXNhZ2UgaW4gcnVudGltZSxcbiAgICAgICAgICAgIC8vIHNpbmNlIGl0J3Mgbm90IGFsbG93ZWQgdG8gYmUgdXNlZCBpbiBwcm94eSBhcyBpdCdzIG91dHNpZGUgb2YgcmVhY3QgY29tcG9uZW50IHRyZWUuXG4gICAgICAgICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgIT09ICdwcm9kdWN0aW9uJykge1xuICAgICAgICAgICAgICAgIGlmIChpc05leHRSb3V0ZXJFcnJvcihlcnIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gYE5leHQuanMgbmF2aWdhdGlvbiBBUEkgaXMgbm90IGFsbG93ZWQgdG8gYmUgdXNlZCBpbiAke2lzUHJveHkgPyAnUHJveHknIDogJ01pZGRsZXdhcmUnfS5gO1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmVxID0gYXJnc1swXTtcbiAgICAgICAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmVxLnVybCk7XG4gICAgICAgICAgICBjb25zdCByZXNvdXJjZSA9IHVybC5wYXRobmFtZSArIHVybC5zZWFyY2g7XG4gICAgICAgICAgICBhd2FpdCBlZGdlSW5zdHJ1bWVudGF0aW9uT25SZXF1ZXN0RXJyb3IoZXJyLCB7XG4gICAgICAgICAgICAgICAgcGF0aDogcmVzb3VyY2UsXG4gICAgICAgICAgICAgICAgbWV0aG9kOiByZXEubWV0aG9kLFxuICAgICAgICAgICAgICAgIGhlYWRlcnM6IE9iamVjdC5mcm9tRW50cmllcyhyZXEuaGVhZGVycy5lbnRyaWVzKCkpXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgcm91dGVyS2luZDogJ1BhZ2VzIFJvdXRlcicsXG4gICAgICAgICAgICAgICAgcm91dGVQYXRoOiAnL3Byb3h5JyxcbiAgICAgICAgICAgICAgICByb3V0ZVR5cGU6ICdwcm94eScsXG4gICAgICAgICAgICAgICAgcmV2YWxpZGF0ZVJlYXNvbjogdW5kZWZpbmVkXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgIH07XG59XG5jb25zdCBpbnRlcm5hbEhhbmRsZXIgPSAob3B0cyk9PntcbiAgICByZXR1cm4gYWRhcHRlcih7XG4gICAgICAgIC4uLm9wdHMsXG4gICAgICAgIEluY3JlbWVudGFsQ2FjaGUsXG4gICAgICAgIGluY3JlbWVudGFsQ2FjaGVIYW5kbGVyLFxuICAgICAgICBwYWdlLFxuICAgICAgICBoYW5kbGVyOiBlcnJvckhhbmRsZWRIYW5kbGVyKGhhbmRsZXJVc2VybGFuZClcbiAgICB9KTtcbn07XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlcihyZXF1ZXN0LCBjdHgpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBpbnRlcm5hbEhhbmRsZXIoe1xuICAgICAgICByZXF1ZXN0OiB7XG4gICAgICAgICAgICB1cmw6IHJlcXVlc3QudXJsLFxuICAgICAgICAgICAgbWV0aG9kOiByZXF1ZXN0Lm1ldGhvZCxcbiAgICAgICAgICAgIGhlYWRlcnM6IHRvTm9kZU91dGdvaW5nSHR0cEhlYWRlcnMocmVxdWVzdC5oZWFkZXJzKSxcbiAgICAgICAgICAgIG5leHRDb25maWc6IHtcbiAgICAgICAgICAgICAgICBiYXNlUGF0aDogcHJvY2Vzcy5lbnYuX19ORVhUX0JBU0VfUEFUSCxcbiAgICAgICAgICAgICAgICBpMThuOiBwcm9jZXNzLmVudi5fX05FWFRfSTE4Tl9DT05GSUcsXG4gICAgICAgICAgICAgICAgdHJhaWxpbmdTbGFzaDogQm9vbGVhbihwcm9jZXNzLmVudi5fX05FWFRfVFJBSUxJTkdfU0xBU0gpLFxuICAgICAgICAgICAgICAgIGV4cGVyaW1lbnRhbDoge1xuICAgICAgICAgICAgICAgICAgICBjYWNoZUxpZmU6IHByb2Nlc3MuZW52Ll9fTkVYVF9DQUNIRV9MSUZFLFxuICAgICAgICAgICAgICAgICAgICBhdXRoSW50ZXJydXB0czogQm9vbGVhbihwcm9jZXNzLmVudi5fX05FWFRfRVhQRVJJTUVOVEFMX0FVVEhfSU5URVJSVVBUUyksXG4gICAgICAgICAgICAgICAgICAgIGNsaWVudFBhcmFtUGFyc2luZ09yaWdpbnM6IHByb2Nlc3MuZW52Ll9fTkVYVF9DTElFTlRfUEFSQU1fUEFSU0lOR19PUklHSU5TXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHBhZ2U6IHtcbiAgICAgICAgICAgICAgICBuYW1lOiBwYWdlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYm9keTogcmVxdWVzdC5tZXRob2QgIT09ICdHRVQnICYmIHJlcXVlc3QubWV0aG9kICE9PSAnSEVBRCcgPyByZXF1ZXN0LmJvZHkgPz8gdW5kZWZpbmVkIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgd2FpdFVudGlsOiBjdHgud2FpdFVudGlsLFxuICAgICAgICAgICAgcmVxdWVzdE1ldGE6IGN0eC5yZXF1ZXN0TWV0YSxcbiAgICAgICAgICAgIHNpZ25hbDogY3R4LnNpZ25hbCB8fCBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsXG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBjdHgud2FpdFVudGlsID09IG51bGwgPyB2b2lkIDAgOiBjdHgud2FpdFVudGlsLmNhbGwoY3R4LCByZXN1bHQud2FpdFVudGlsKTtcbiAgICByZXR1cm4gcmVzdWx0LnJlc3BvbnNlO1xufVxuLy8gYmFja3dhcmRzIGNvbXBhdFxuZXhwb3J0IGRlZmF1bHQgaW50ZXJuYWxIYW5kbGVyO1xuXG4vLyMgc291cmNlTWFwcGluZ1VSTD1taWRkbGV3YXJlLmpzLm1hcFxuIl0sIm5hbWVzIjpbXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(middleware)/./node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Fkartikarora%2FDocuments%2Fpersonal%2Ftraintickets%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Fkartikarora%2FDocuments%2Fpersonal%2Ftraintickets&matchers=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(middleware)/./proxy.ts":
/*!******************!*\
  !*** ./proxy.ts ***!
  \******************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   config: () => (/* binding */ config),\n/* harmony export */   proxy: () => (/* binding */ proxy)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(middleware)/./node_modules/next/dist/api/server.js\");\n\nfunction proxy(request) {\n    const url = request.nextUrl.clone();\n    const host = request.headers.get(\"host\");\n    // 1. WWW redirection to non-WWW\n    if (host && host.startsWith(\"www.\")) {\n        const newHost = host.replace(/^www\\./, \"\");\n        const protocol = request.headers.get(\"x-forwarded-proto\") || \"https\";\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.redirect(`${protocol}://${newHost}${url.pathname}${url.search}`, 301);\n    }\n    // 2. Force HTTPS in production / non-dev\n    const isDev = \"development\" === \"development\";\n    const proto = request.headers.get(\"x-forwarded-proto\");\n    if (!isDev && proto === \"http\") {\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.redirect(`https://${host}${url.pathname}${url.search}`, 301);\n    }\n    return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.next();\n}\nconst config = {\n    matcher: [\n        /*\n     * Match all request paths except for the ones starting with:\n     * - api (API routes)\n     * - _next/static (static files)\n     * - _next/image (image optimization files)\n     * - favicon.ico (favicon file)\n     * - sitemap.xml, robots.txt, and similar files\n     */ \"/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\\\.png$).*)\"\n    ]\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKG1pZGRsZXdhcmUpLy4vcHJveHkudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQTJDO0FBR3BDLFNBQVNDLE1BQU1DLE9BQW9CO0lBQ3hDLE1BQU1DLE1BQU1ELFFBQVFFLE9BQU8sQ0FBQ0MsS0FBSztJQUNqQyxNQUFNQyxPQUFPSixRQUFRSyxPQUFPLENBQUNDLEdBQUcsQ0FBQztJQUVqQyxnQ0FBZ0M7SUFDaEMsSUFBSUYsUUFBUUEsS0FBS0csVUFBVSxDQUFDLFNBQVM7UUFDbkMsTUFBTUMsVUFBVUosS0FBS0ssT0FBTyxDQUFDLFVBQVU7UUFDdkMsTUFBTUMsV0FBV1YsUUFBUUssT0FBTyxDQUFDQyxHQUFHLENBQUMsd0JBQXdCO1FBQzdELE9BQU9SLHFEQUFZQSxDQUFDYSxRQUFRLENBQzFCLEdBQUdELFNBQVMsR0FBRyxFQUFFRixVQUFVUCxJQUFJVyxRQUFRLEdBQUdYLElBQUlZLE1BQU0sRUFBRSxFQUN0RDtJQUVKO0lBRUEseUNBQXlDO0lBQ3pDLE1BQU1DLFFBQVFDLGtCQUF5QjtJQUN2QyxNQUFNQyxRQUFRaEIsUUFBUUssT0FBTyxDQUFDQyxHQUFHLENBQUM7SUFDbEMsSUFBSSxDQUFDUSxTQUFTRSxVQUFVLFFBQVE7UUFDOUIsT0FBT2xCLHFEQUFZQSxDQUFDYSxRQUFRLENBQzFCLENBQUMsUUFBUSxFQUFFUCxPQUFPSCxJQUFJVyxRQUFRLEdBQUdYLElBQUlZLE1BQU0sRUFBRSxFQUM3QztJQUVKO0lBRUEsT0FBT2YscURBQVlBLENBQUNtQixJQUFJO0FBQzFCO0FBRU8sTUFBTUMsU0FBUztJQUNwQkMsU0FBUztRQUNQOzs7Ozs7O0tBT0MsR0FDRDtLQUNEO0FBQ0gsRUFBRSIsInNvdXJjZXMiOlsiL1VzZXJzL2thcnRpa2Fyb3JhL0RvY3VtZW50cy9wZXJzb25hbC90cmFpbnRpY2tldHMvcHJveHkudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTmV4dFJlc3BvbnNlIH0gZnJvbSBcIm5leHQvc2VydmVyXCI7XG5pbXBvcnQgdHlwZSB7IE5leHRSZXF1ZXN0IH0gZnJvbSBcIm5leHQvc2VydmVyXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm94eShyZXF1ZXN0OiBOZXh0UmVxdWVzdCkge1xuICBjb25zdCB1cmwgPSByZXF1ZXN0Lm5leHRVcmwuY2xvbmUoKTtcbiAgY29uc3QgaG9zdCA9IHJlcXVlc3QuaGVhZGVycy5nZXQoXCJob3N0XCIpO1xuXG4gIC8vIDEuIFdXVyByZWRpcmVjdGlvbiB0byBub24tV1dXXG4gIGlmIChob3N0ICYmIGhvc3Quc3RhcnRzV2l0aChcInd3dy5cIikpIHtcbiAgICBjb25zdCBuZXdIb3N0ID0gaG9zdC5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gICAgY29uc3QgcHJvdG9jb2wgPSByZXF1ZXN0LmhlYWRlcnMuZ2V0KFwieC1mb3J3YXJkZWQtcHJvdG9cIikgfHwgXCJodHRwc1wiO1xuICAgIHJldHVybiBOZXh0UmVzcG9uc2UucmVkaXJlY3QoXG4gICAgICBgJHtwcm90b2NvbH06Ly8ke25ld0hvc3R9JHt1cmwucGF0aG5hbWV9JHt1cmwuc2VhcmNofWAsXG4gICAgICAzMDEsXG4gICAgKTtcbiAgfVxuXG4gIC8vIDIuIEZvcmNlIEhUVFBTIGluIHByb2R1Y3Rpb24gLyBub24tZGV2XG4gIGNvbnN0IGlzRGV2ID0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09IFwiZGV2ZWxvcG1lbnRcIjtcbiAgY29uc3QgcHJvdG8gPSByZXF1ZXN0LmhlYWRlcnMuZ2V0KFwieC1mb3J3YXJkZWQtcHJvdG9cIik7XG4gIGlmICghaXNEZXYgJiYgcHJvdG8gPT09IFwiaHR0cFwiKSB7XG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5yZWRpcmVjdChcbiAgICAgIGBodHRwczovLyR7aG9zdH0ke3VybC5wYXRobmFtZX0ke3VybC5zZWFyY2h9YCxcbiAgICAgIDMwMSxcbiAgICApO1xuICB9XG5cbiAgcmV0dXJuIE5leHRSZXNwb25zZS5uZXh0KCk7XG59XG5cbmV4cG9ydCBjb25zdCBjb25maWcgPSB7XG4gIG1hdGNoZXI6IFtcbiAgICAvKlxuICAgICAqIE1hdGNoIGFsbCByZXF1ZXN0IHBhdGhzIGV4Y2VwdCBmb3IgdGhlIG9uZXMgc3RhcnRpbmcgd2l0aDpcbiAgICAgKiAtIGFwaSAoQVBJIHJvdXRlcylcbiAgICAgKiAtIF9uZXh0L3N0YXRpYyAoc3RhdGljIGZpbGVzKVxuICAgICAqIC0gX25leHQvaW1hZ2UgKGltYWdlIG9wdGltaXphdGlvbiBmaWxlcylcbiAgICAgKiAtIGZhdmljb24uaWNvIChmYXZpY29uIGZpbGUpXG4gICAgICogLSBzaXRlbWFwLnhtbCwgcm9ib3RzLnR4dCwgYW5kIHNpbWlsYXIgZmlsZXNcbiAgICAgKi9cbiAgICBcIi8oKD8hYXBpfF9uZXh0L3N0YXRpY3xfbmV4dC9pbWFnZXxmYXZpY29uLmljb3xyb2JvdHMudHh0fHNpdGVtYXAueG1sfC4qXFxcXC5wbmckKS4qKVwiLFxuICBdLFxufTtcbiJdLCJuYW1lcyI6WyJOZXh0UmVzcG9uc2UiLCJwcm94eSIsInJlcXVlc3QiLCJ1cmwiLCJuZXh0VXJsIiwiY2xvbmUiLCJob3N0IiwiaGVhZGVycyIsImdldCIsInN0YXJ0c1dpdGgiLCJuZXdIb3N0IiwicmVwbGFjZSIsInByb3RvY29sIiwicmVkaXJlY3QiLCJwYXRobmFtZSIsInNlYXJjaCIsImlzRGV2IiwicHJvY2VzcyIsInByb3RvIiwibmV4dCIsImNvbmZpZyIsIm1hdGNoZXIiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(middleware)/./proxy.ts\n");

/***/ }),

/***/ "../app-render/after-task-async-storage.external":
/*!***********************************************************************************!*\
  !*** external "next/dist/server/app-render/after-task-async-storage.external.js" ***!
  \***********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/server/app-render/after-task-async-storage.external.js");

/***/ }),

/***/ "../app-render/work-async-storage.external":
/*!*****************************************************************************!*\
  !*** external "next/dist/server/app-render/work-async-storage.external.js" ***!
  \*****************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/server/app-render/work-async-storage.external.js");

/***/ }),

/***/ "../app-render/work-unit-async-storage.external":
/*!**********************************************************************************!*\
  !*** external "next/dist/server/app-render/work-unit-async-storage.external.js" ***!
  \**********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/server/app-render/work-unit-async-storage.external.js");

/***/ }),

/***/ "./memory-cache.external":
/*!**********************************************************************************!*\
  !*** external "next/dist/server/lib/incremental-cache/memory-cache.external.js" ***!
  \**********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/server/lib/incremental-cache/memory-cache.external.js");

/***/ }),

/***/ "./shared-cache-controls.external":
/*!*******************************************************************************************!*\
  !*** external "next/dist/server/lib/incremental-cache/shared-cache-controls.external.js" ***!
  \*******************************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/server/lib/incremental-cache/shared-cache-controls.external.js");

/***/ }),

/***/ "./tags-manifest.external":
/*!***********************************************************************************!*\
  !*** external "next/dist/server/lib/incremental-cache/tags-manifest.external.js" ***!
  \***********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/server/lib/incremental-cache/tags-manifest.external.js");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("crypto");

/***/ }),

/***/ "next/dist/build/adapter/setup-node-env.external":
/*!******************************************************************!*\
  !*** external "next/dist/build/adapter/setup-node-env.external" ***!
  \******************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/build/adapter/setup-node-env.external");

/***/ }),

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ }),

/***/ "node:async_hooks":
/*!***********************************!*\
  !*** external "node:async_hooks" ***!
  \***********************************/
/***/ ((module) => {

module.exports = require("node:async_hooks");

/***/ }),

/***/ "path":
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("path");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("./webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/@opentelemetry","vendor-chunks/next","vendor-chunks/@swc"], () => (__webpack_exec__("(middleware)/./node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js?absolutePagePath=%2FUsers%2Fkartikarora%2FDocuments%2Fpersonal%2Ftraintickets%2Fproxy.ts&page=%2Fproxy&rootDir=%2FUsers%2Fkartikarora%2FDocuments%2Fpersonal%2Ftraintickets&matchers=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();