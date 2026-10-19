// Bun 支持用 `?query` 让同一模块以独立实例加载（worker 夹具靠它隔离存储与作用域）。
// tsc 不认识这种写法，这里按查询串补纯类型声明：类型指向真实模块，不产生任何运行时值。
declare module "*image-storage.ts?generation-image-cleanup-contract-worker" {
    export * from "@/services/image-storage";
}

declare module "*image-storage.ts?scope-cleanup-switch-worker" {
    export * from "@/services/image-storage";
}

declare module "*image-storage.ts?scope-cleanup-late-canvas-reference-worker" {
    export * from "@/services/image-storage";
}

declare module "*project-asset-sync.ts?generation-media-commit-race-worker" {
    export * from "@/services/project-asset-sync";
}
