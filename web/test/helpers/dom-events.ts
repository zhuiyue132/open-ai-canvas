import type { Event as HappyDomEvent } from "happy-dom";

// The installed constructors are happy-dom's; bridge its Event declaration to lib.dom only at dispatch.
export function dispatchHappyDomEvent(target: EventTarget, event: HappyDomEvent): boolean {
    return target.dispatchEvent(event as unknown as Event);
}
