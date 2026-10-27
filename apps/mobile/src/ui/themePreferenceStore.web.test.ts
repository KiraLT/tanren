import { afterEach, describe, expect, it, vi } from "vitest"
import { saveThemePreference, THEME_STORAGE_KEY } from "./themePreferenceStore.web"

/** A `<html>` stand-in that records its attributes, and a storage that records or throws. */
const stubDom = (storage: Pick<Storage, "setItem">) => {
  const attributes = new Map<string, string>()
  const documentElement = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  }
  vi.stubGlobal("document", { documentElement })
  vi.stubGlobal("localStorage", storage)
  return attributes
}

const recordingStorage = () => vi.fn<Storage["setItem"]>()

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("saveThemePreference (web)", () => {
  it("marks html[data-theme] and stores an explicit scheme", () => {
    const setItem = recordingStorage()
    const attributes = stubDom({ setItem })
    saveThemePreference("dark")
    expect(attributes.get("data-theme")).toBe("dark")
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "dark")
  })

  it("removes data-theme for system, like the pre-mount script in index.html", () => {
    const attributes = stubDom({ setItem: recordingStorage() })
    saveThemePreference("light")
    expect(attributes.get("data-theme")).toBe("light")
    saveThemePreference("system")
    expect(attributes.has("data-theme")).toBe(false)
  })

  it("still marks the document when storage throws, and does not throw", () => {
    const attributes = stubDom({
      setItem: () => {
        // biome-ignore lint/plugin/noThrow: the fake reproduces a blocked localStorage, which throws
        throw new Error("SecurityError")
      },
    })
    expect(() => saveThemePreference("light")).not.toThrow()
    expect(attributes.get("data-theme")).toBe("light")
  })

  it("does not throw without a document", () => {
    vi.stubGlobal("document", undefined)
    vi.stubGlobal("localStorage", { setItem: recordingStorage() })
    expect(() => saveThemePreference("dark")).not.toThrow()
  })
})
