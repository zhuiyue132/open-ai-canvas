import type { Event as HappyDomEvent } from "happy-dom";

// 测试用 happy-dom 的构造器造事件，却派发给 lib.dom 声明的 EventTarget（document、渲染容器来自 DOM 类型）。
// 两套 Event 声明并不结构兼容，逐个调用点强转会把噪音写进上游测试；这里只补一条重载，
// 让 happy-dom 事件能被 dispatchEvent 接受，其余参数（比如数字）仍按原签名拒绝。
// 上限：`Pick<..., "type"> & object` 只约束形状，不保证是真事件；派发前仍由 happy-dom 运行时校验。
declare global {
    interface EventTarget {
        dispatchEvent(event: Pick<HappyDomEvent, "type"> & object): boolean;
    }
}
