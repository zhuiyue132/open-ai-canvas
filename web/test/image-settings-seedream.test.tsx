import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageSettingsPanel } from "../src/components/image-settings-panel";
import { canvasThemes } from "../src/lib/canvas-theme";
import { defaultImageCapabilityConfig } from "../src/lib/model-capabilities";
import { priceTierToForm, skuSelectorFromForm } from "../src/pages/admin/components/channel-model-price-tier-form";
import type { AiConfig } from "../src/stores/use-config-store";
import type { ChannelModelPriceTier } from "../src/services/api/wallet";

function seedreamConfig(model: string): AiConfig {
    return {
        imageModel: model,
        model,
        size: "2048x2048",
        transparentBackground: "false",
        channels: [
            {
                id: "ch-seedream",
                scope: "system",
                enabled: true,
                name: "可美",
                baseUrl: "/api/ai/system/CHANNEL",
                apiFormat: "openai",
                concurrencyLimit: 0,
                models: [model],
                modelCosts: [{ model, protocol: "km-kemei-seedream", capability: "image", priceConfigured: true }],
                hasApiKey: true,
                hasSecretKey: false,
                createdAt: "",
                updatedAt: "",
            },
        ],
    } as unknown as AiConfig;
}

describe("ImageSettingsPanel with km-kemei-seedream", () => {
    test("Pro/Flash 只显示 1K / 1.5K / 2K，不显示 4K，且分辨率分段只有一处", () => {
        for (const model of ["doubao-seedream-5-0-pro-260628", "doubao-seedream-5-0-flash-260915"]) {
            const html = renderToStaticMarkup(<ImageSettingsPanel config={seedreamConfig(model)} onConfigChange={() => {}} theme={canvasThemes.dark} />);
            expect((html.match(/分辨率/g) || []).length).toBe(1);
            expect(html).toContain("1K");
            expect(html).toContain("1.5K");
            expect(html).toContain("2K");
            expect(html).not.toContain("4K");
        }
    });

    test("存量 Seedream 价格档 quality=1k/1.5k/2k 安全迁移为 imageResolution，无冲突", () => {
        const profile = defaultImageCapabilityConfig("km-kemei-seedream", "doubao-seedream-5-0-pro-260628");
        expect(profile.resolution).toEqual({ supported: true, values: ["1k", "1.5k", "2k"], default: "2k" });

        // 存量档位只有 quality 选择器与价格；补齐当前 ChannelModelPriceTier 的必填字段，selector 保持 legacy 形态。
        const legacyTier = (id: string, quality: string, unitPriceMicrocredits: number): ChannelModelPriceTier => ({
            id,
            channelModelId: "cm-seedream",
            selector: { quality },
            selectorKey: JSON.stringify({ quality }),
            resolution: "",
            videoSeconds: 0,
            providerModelKey: "km-kemei-seedream",
            billingMode: "fixed_request",
            unitPriceMicrocredits,
            inputTokenPriceMicrocredits: 0,
            outputTokenPriceMicrocredits: 0,
            cachedTokenPriceMicrocredits: 0,
            priceConfigured: true,
            enabled: true,
            priceVersion: 1,
            createdAt: "",
            updatedAt: "",
        });
        const rawTiers = [legacyTier("t1", "1k", 20000000), legacyTier("t2", "1.5k", 40000000), legacyTier("t3", "2k", 40000000)];

        const formValues = rawTiers.map((tier) => priceTierToForm(tier, profile, "km-kemei-seedream"));
        expect(formValues[0].imageResolution).toBe("1k");
        expect(formValues[1].imageResolution).toBe("1.5k");
        expect(formValues[2].imageResolution).toBe("2k");

        const selectors = formValues.map((values) => skuSelectorFromForm("image", values, { version: 1, image: profile }));
        expect(selectors[0]).toEqual({ imageResolution: "1k" });
        expect(selectors[1]).toEqual({ imageResolution: "1.5k" });
        expect(selectors[2]).toEqual({ imageResolution: "2k" });
        expect(new Set(selectors.map((selector) => JSON.stringify(selector))).size).toBe(3);
    });
});
