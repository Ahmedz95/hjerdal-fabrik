// HJERDAL Designer som ett eget Mac-program: ett fönster med Safaris motor (WebKit) som visar
// Designer från servern på den här datorn, med egen ikon i Dock och vanliga menyer.
//
// gor-app.sh bygger programmet med swiftc från Apples utvecklarverktyg och skriver in fabrikens
// mapp, Python och PATH i Info.plist. Programmet startar servern om den inte redan kör
// (fabrik.py designer --ingen-webblasare) och visar Designer när servern svarar.

import Cocoa
import WebKit

let fabrikMapp = Bundle.main.object(forInfoDictionaryKey: "HJERDALFabrik") as? String ?? ""
let python = Bundle.main.object(forInfoDictionaryKey: "HJERDALPython") as? String ?? "/usr/bin/python3"
let sokvag = Bundle.main.object(forInfoDictionaryKey: "HJERDALPath") as? String ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
/// server.py ber programmet visa en sida med hjerdal-designer:http://127.0.0.1:4848/#/kund/x.
let schema = "hjerdal-designer"
/// Provkörningen i GitHub: programmet öppnar Designer, sparar bilder med det här prefixet och
/// avslutar med 0 om allt fungerade.
let prov = ProcessInfo.processInfo.environment["HJERDAL_PROV"]

struct Server {
    let bas: URL
    let pid: Int32
}

struct Startfel: Error {
    let text: String
}

final class Svar: @unchecked Sendable {
    var data: Data?
}

func lokal(_ url: URL) -> Bool {
    url.scheme == "http" && ["127.0.0.1", "localhost"].contains(url.host ?? "")
}

/// Samma sida (det efter #) hos servern, som kan ha fått en annan port sedan sidan öppnades.
func sida(_ server: Server, _ url: URL?) -> URL {
    guard let fragment = url?.fragment, let sida = URL(string: server.bas.absoluteString + "#" + fragment) else { return server.bas }
    return sida
}

/// Servern som kör för den här fabriken, om den svarar.
func lasServer() -> Server? {
    let statusfil = URL(fileURLWithPath: fabrikMapp).appendingPathComponent("ut/.designer.json")
    guard let data = try? Data(contentsOf: statusfil),
          let status = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let port = status["port"] as? Int,
          let bas = URL(string: "http://127.0.0.1:\(port)/") else { return nil }
    var fraga = URLRequest(url: bas.appendingPathComponent("api/info"))
    fraga.timeoutInterval = 1.5
    fraga.cachePolicy = .reloadIgnoringLocalCacheData
    let svar = Svar()
    let klar = DispatchSemaphore(value: 0)
    URLSession.shared.dataTask(with: fraga) { data, _, _ in
        svar.data = data
        klar.signal()
    }.resume()
    klar.wait()
    guard let data = svar.data,
          let info = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let fabrik = info["fabrik"] as? String,
          URL(fileURLWithPath: fabrik).resolvingSymlinksInPath().path == URL(fileURLWithPath: fabrikMapp).resolvingSymlinksInPath().path
    else { return nil }
    return Server(bas: bas, pid: Int32(status["pid"] as? Int ?? 0))
}

func loggslut(_ logg: URL) -> String {
    guard let text = try? String(contentsOf: logg, encoding: .utf8) else { return "" }
    return text.split(separator: "\n", omittingEmptySubsequences: false).suffix(15).joined(separator: "\n")
}

/// Startar servern om den inte redan kör och väntar tills den svarar. Körs i bakgrunden.
///
/// fabrik.py designer avslutar sig direkt om servern redan kör, och startar om en server som kör
/// äldre kod. Därför räknas servern som klar först när den som svarar är den nya processen, eller
/// när processen har avslutat sig och en server svarar.
func startaServer() -> Result<Server, Startfel> {
    let mapp = URL(fileURLWithPath: fabrikMapp)
    let skript = mapp.appendingPathComponent("fabrik.py")
    guard FileManager.default.fileExists(atPath: skript.path) else {
        return .failure(Startfel(text: "Hittar inte fabriken i \(fabrikMapp).\n\nHar mappen flyttats? Dubbelklicka på designer/installera.command i den nya mappen."))
    }
    let logg = mapp.appendingPathComponent("ut/designer.log")
    try? FileManager.default.createDirectory(at: logg.deletingLastPathComponent(), withIntermediateDirectories: true)
    if !FileManager.default.fileExists(atPath: logg.path) {
        FileManager.default.createFile(atPath: logg.path, contents: nil)
    }
    let process = Process()
    process.executableURL = URL(fileURLWithPath: python)
    process.arguments = [skript.path, "designer", "--ingen-webblasare"]
    process.currentDirectoryURL = mapp
    var miljo = ProcessInfo.processInfo.environment
    miljo["PATH"] = sokvag + ":" + (miljo["PATH"] ?? "/usr/bin:/bin")
    miljo["PYTHONUNBUFFERED"] = "1"
    process.environment = miljo
    process.standardInput = FileHandle.nullDevice
    if let ut = try? FileHandle(forWritingTo: logg) {
        _ = try? ut.seekToEnd()
        process.standardOutput = ut
        process.standardError = ut
    }
    do {
        try process.run()
    } catch {
        return .failure(Startfel(text: "Kunde inte starta Python (\(python)): \(error.localizedDescription)\n\nDubbelklicka på designer/installera.command igen."))
    }
    let slut = Date().addingTimeInterval(120)
    var avslutad: Date?
    while Date() < slut {
        if let server = lasServer(), server.pid == process.processIdentifier || !process.isRunning {
            return .success(server)
        }
        if !process.isRunning {
            avslutad = avslutad ?? Date()
            if process.terminationStatus != 0 || Date().timeIntervalSince(avslutad ?? Date()) > 5 { break }
        }
        Thread.sleep(forTimeInterval: 0.25)
    }
    return .failure(Startfel(text: "Designer kunde inte starta. Det här står sist i \(logg.path):\n\n\(loggslut(logg))"))
}

/// Ett ledigt filnamn i mappen: "namn.html", annars "namn 2.html" och så vidare.
func ledigt(_ url: URL) -> URL {
    var kandidat = url
    var n = 2
    while FileManager.default.fileExists(atPath: kandidat.path) {
        let namn = url.deletingLastPathComponent().appendingPathComponent(url.deletingPathExtension().lastPathComponent + " \(n)")
        kandidat = url.pathExtension.isEmpty ? namn : namn.appendingPathExtension(url.pathExtension)
        n += 1
    }
    return kandidat
}

func png(_ bild: CGImage?) -> Data? {
    bild.flatMap { NSBitmapImageRep(cgImage: $0).representation(using: .png, properties: [:]) }
}

@MainActor
final class Designer: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var fonster: NSWindow?
    private var webb: WKWebView?
    private var server: Server?
    private var startar = false
    /// Sidan som ska visas när servern svarar, i stället för startsidan.
    private var vantande: URL?
    /// Starter i rad där servern sa sig svara men sidan ändå inte gick att nå.
    private var forsok = 0
    private var nedladdningar: [ObjectIdentifier: URL] = [:]
    private var provStartat = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.mainMenu = meny()
        let installningar = WKWebViewConfiguration()
        installningar.applicationNameForUserAgent = "HJERDALDesigner/1.0 Safari/605.1.15"
        if #available(macOS 12.3, *) {
            installningar.preferences.isElementFullscreenEnabled = true
        }
        if prov != nil {
            installningar.userContentController.addUserScript(WKUserScript(
                source: "window.__fel = []; addEventListener('error', (e) => __fel.push(String(e.message))); addEventListener('unhandledrejection', (e) => __fel.push(String(e.reason)));",
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        let webb = WKWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900), configuration: installningar)
        webb.navigationDelegate = self
        webb.uiDelegate = self
        let zoom = UserDefaults.standard.double(forKey: "zoom")
        if zoom > 0 {
            webb.pageZoom = CGFloat(zoom)
        }
        if #available(macOS 13.3, *) {
            webb.isInspectable = true
        }
        self.webb = webb

        let fonster = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
                               styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        fonster.title = "HJERDAL Designer"
        fonster.contentView = webb
        fonster.contentMinSize = NSSize(width: 720, height: 520)
        fonster.collectionBehavior.insert(.fullScreenPrimary)
        fonster.tabbingMode = .disallowed
        fonster.isReleasedWhenClosed = false
        fonster.delegate = self
        if !fonster.setFrameUsingName("Designer"), let skarm = NSScreen.main?.visibleFrame {
            let bredd = min(1440, skarm.width * 0.92), hojd = min(900, skarm.height * 0.92)
            fonster.setFrame(NSRect(x: skarm.midX - bredd / 2, y: skarm.midY - hojd / 2, width: bredd, height: hojd), display: false)
        }
        _ = fonster.setFrameAutosaveName("Designer")
        self.fonster = fonster
        visaMeddelande("Startar HJERDAL Designer …")
        fonster.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        starta()
        if prov != nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + 180) {
                print("Provet tog för lång tid.")
                exit(2)
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        fonster?.makeKeyAndOrderFront(nil)
        return true
    }

    /// Från server.py, när Claude-appen eller Terminal ber om Designer.
    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.last, url.scheme == schema,
              let mal = URL(string: String(url.absoluteString.dropFirst(schema.count + 1))), lokal(mal) else { return }
        if let server, !startar {
            visa(sida(server, mal))
        } else {
            vantande = mal
        }
        fonster?.makeKeyAndOrderFront(nil)
    }

    /// Servern stänger sig själv efter en halvtimme utan fönster, till exempel om datorn har sovit.
    /// Märks det när programmet blir aktivt startas den igen, och samma sida visas.
    func applicationDidBecomeActive(_ notification: Notification) {
        guard server != nil, !startar else { return }
        Task {
            let svarar = await Task.detached { () async -> Server? in
                if let server = lasServer() { return server }
                // En server som startar om efter Hämta senaste fabriken är borta en kort stund.
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                return lasServer()
            }.value
            guard !self.startar else { return }
            if let svarar {
                if svarar.bas != self.server?.bas {
                    self.server = svarar
                    self.visa(sida(svarar, self.webb?.url))
                }
            } else {
                if let url = self.webb?.url, lokal(url) { self.vantande = url }
                self.server = nil
                self.starta()
            }
        }
    }

    // MARK: Servern

    private func starta() {
        guard !startar else { return }
        startar = true
        Task {
            let resultat = await Task.detached { startaServer() }.value
            self.startar = false
            switch resultat {
            case .success(let server):
                self.server = server
                self.visa(sida(server, self.vantande))
                self.vantande = nil
            case .failure(let fel):
                self.server = nil
                self.visaMeddelande(fel.text, igen: true)
                if prov != nil {
                    print(fel.text)
                    exit(3)
                }
            }
        }
    }

    private func visa(_ url: URL) {
        webb?.load(URLRequest(url: url))
    }

    private func visaMeddelande(_ text: String, igen: Bool = false) {
        let skyddad = text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
        let knapp = igen ? "<p><a href=\"\(schema):starta\">Försök igen</a></p>" : ""
        webb?.loadHTMLString("""
            <!doctype html><meta charset="utf-8"><style>
            :root { color-scheme: light dark; --bg: #f5f6f4; --fg: #101315; }
            @media (prefers-color-scheme: dark) { :root { --bg: #101315; --fg: #f5f6f4; } }
            html { background: var(--bg); color: var(--fg); font: 15px/1.5 -apple-system, system-ui, sans-serif; }
            body { display: grid; place-items: center; min-height: 92vh; margin: 0 32px; }
            main { max-width: 46em; white-space: pre-wrap; overflow-wrap: anywhere; }
            a { display: inline-block; margin-top: 8px; padding: 8px 18px; border-radius: 8px; background: var(--fg); color: var(--bg); text-decoration: none; }
            </style><main>\(skyddad)\(knapp)</main>
            """, baseURL: nil)
    }

    // MARK: Menyerna

    @objc func laddaOm(_ sender: Any?) {
        if server != nil, let url = webb?.url, lokal(url) {
            webb?.reload()
        } else {
            starta()
        }
    }

    @objc func storre(_ sender: Any?) { zooma((webb?.pageZoom ?? 1) * 1.1) }
    @objc func mindre(_ sender: Any?) { zooma((webb?.pageZoom ?? 1) / 1.1) }
    @objc func normalStorlek(_ sender: Any?) { zooma(1) }

    private func zooma(_ zoom: CGFloat) {
        let ny = abs(zoom - 1) < 0.04 ? 1 : min(max(zoom, 0.5), 3)
        webb?.pageZoom = ny
        UserDefaults.standard.set(Double(ny), forKey: "zoom")
    }

    private func meny() -> NSMenu {
        let namn = "HJERDAL Designer"
        func post(_ meny: NSMenu, _ titel: String, _ handling: Selector?, _ tangent: String = "", _ extra: NSEvent.ModifierFlags = []) -> NSMenuItem {
            let post = meny.addItem(withTitle: titel, action: handling, keyEquivalent: tangent)
            post.keyEquivalentModifierMask = extra.union(tangent.isEmpty ? [] : .command)
            return post
        }
        let huvud = NSMenu()
        func undermeny(_ titel: String) -> NSMenu {
            let meny = NSMenu(title: titel)
            huvud.addItem(withTitle: titel, action: nil, keyEquivalent: "").submenu = meny
            return meny
        }

        let app = undermeny(namn)
        _ = post(app, "Om \(namn)", #selector(NSApplication.orderFrontStandardAboutPanel(_:)))
        app.addItem(.separator())
        _ = post(app, "Göm \(namn)", #selector(NSApplication.hide(_:)), "h")
        _ = post(app, "Göm övriga", #selector(NSApplication.hideOtherApplications(_:)), "h", .option)
        _ = post(app, "Visa alla", #selector(NSApplication.unhideAllApplications(_:)))
        app.addItem(.separator())
        _ = post(app, "Avsluta \(namn)", #selector(NSApplication.terminate(_:)), "q")

        let redigera = undermeny("Redigera")
        _ = post(redigera, "Ångra", Selector(("undo:")), "z")
        _ = post(redigera, "Gör om", Selector(("redo:")), "z", .shift)
        redigera.addItem(.separator())
        _ = post(redigera, "Klipp ut", #selector(NSText.cut(_:)), "x")
        _ = post(redigera, "Kopiera", #selector(NSText.copy(_:)), "c")
        _ = post(redigera, "Klistra in", #selector(NSText.paste(_:)), "v")
        _ = post(redigera, "Markera allt", #selector(NSText.selectAll(_:)), "a")

        let visa = undermeny("Visa")
        _ = post(visa, "Ladda om", #selector(laddaOm(_:)), "r")
        visa.addItem(.separator())
        _ = post(visa, "Större", #selector(storre(_:)), "+")
        // Cmd = är Cmd + på amerikanska tangentbord.
        let dold = post(visa, "Större", #selector(storre(_:)), "=")
        dold.isHidden = true
        dold.allowsKeyEquivalentWhenHidden = true
        _ = post(visa, "Mindre", #selector(mindre(_:)), "-")
        _ = post(visa, "Normal storlek", #selector(normalStorlek(_:)), "0")
        visa.addItem(.separator())
        _ = post(visa, "Helskärm", #selector(NSWindow.toggleFullScreen(_:)), "f", .control)

        let fonster = undermeny("Fönster")
        _ = post(fonster, "Minimera", #selector(NSWindow.performMiniaturize(_:)), "m")
        _ = post(fonster, "Zooma", #selector(NSWindow.performZoom(_:)))
        fonster.addItem(.separator())
        _ = post(fonster, "Stäng", #selector(NSWindow.performClose(_:)), "w")
        NSApp.windowsMenu = fonster
        return huvud
    }

    // MARK: Sidorna

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.allow) }
        if url.scheme == schema {
            starta()
            return decisionHandler(.cancel)
        }
        if navigationAction.shouldPerformDownload {
            return decisionHandler(.download)
        }
        if lokal(url) || ["about", "blob", "data"].contains(url.scheme ?? "") || navigationAction.targetFrame?.isMainFrame == false {
            return decisionHandler(.allow)
        }
        // Länkar ut ur Designer, till exempel kundens webbplats eller ett mejl, öppnas där de hör hemma.
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let bilaga = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")?.lowercased().hasPrefix("attachment") ?? false
        decisionHandler(bilaga || !navigationResponse.canShowMIMEType ? .download : .allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let url = webView.url, lokal(url) else { return }
        forsok = 0
        if let prov, !provStartat {
            provStartat = true
            Task { await self.provkor(prov) }
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let fel = error as NSError
        guard fel.domain == NSURLErrorDomain,
              [NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut].contains(fel.code) else { return }
        forsok += 1
        if forsok > 3 {
            visaMeddelande("Designer svarar inte. Se \(fabrikMapp)/ut/designer.log.", igen: true)
            return
        }
        if let url = fel.userInfo[NSURLErrorFailingURLErrorKey] as? URL, lokal(url) {
            vantande = url
        }
        server = nil
        starta()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    // Länkar med target="_blank", till exempel Öppna i webbläsaren, öppnas i standardwebbläsaren.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["http", "https", "mailto", "tel"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webViewDidClose(_ webView: WKWebView) {
        fonster?.close()
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard let fonster else { return completionHandler(nil) }
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.beginSheetModal(for: fonster) { svar in
            completionHandler(svar == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard let fonster else { return completionHandler() }
        let ruta = NSAlert()
        ruta.messageText = message
        ruta.beginSheetModal(for: fonster) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard let fonster else { return completionHandler(false) }
        let ruta = NSAlert()
        ruta.messageText = message
        ruta.addButton(withTitle: "OK")
        ruta.addButton(withTitle: "Avbryt")
        ruta.beginSheetModal(for: fonster) { svar in completionHandler(svar == .alertFirstButtonReturn) }
    }

    // MARK: Hämtade filer

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    /// Som i webbläsaren hamnar filen i Hämtade filer, där Designer säger att den ligger.
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let mapp = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        let mal = ledigt(mapp.appendingPathComponent(suggestedFilename))
        nedladdningar[ObjectIdentifier(download)] = mal
        completionHandler(mal)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let mal = nedladdningar.removeValue(forKey: ObjectIdentifier(download)) else { return }
        // Hämtade filer i Dock studsar till, som när Safari hämtar något.
        DistributedNotificationCenter.default().post(name: Notification.Name("com.apple.DownloadFileFinished"), object: mal.path)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        nedladdningar.removeValue(forKey: ObjectIdentifier(download))
        NSSound.beep()
    }

    // MARK: Provkörningen

    private func js(_ kod: String) async -> String {
        guard let webb else { return "" }
        return await withCheckedContinuation { fortsatt in
            webb.evaluateJavaScript(kod) { svar, _ in
                fortsatt.resume(returning: svar.map { "\($0)" } ?? "")
            }
        }
    }

    private func sparaBild(_ fil: String) async {
        guard let webb else { return }
        let data: Data? = await withCheckedContinuation { fortsatt in
            webb.takeSnapshot(with: nil) { bild, _ in
                var ram = NSRect(origin: .zero, size: bild?.size ?? .zero)
                fortsatt.resume(returning: png(bild?.cgImage(forProposedRect: &ram, context: nil, hints: nil)))
            }
        }
        try? data?.write(to: URL(fileURLWithPath: fil))
    }

    private func vanta(_ sekunder: Double) async {
        try? await Task.sleep(nanoseconds: UInt64(sekunder * 1_000_000_000))
    }

    /// Startsidan och en kund visas, och en fil hämtas som när Exportera för kunden används.
    private func provkor(_ prefix: String) async {
        await vanta(3)
        await sparaBild(prefix + "-start.png")
        _ = await js("location.hash = '#/kund/bistro-nordvik'")
        await vanta(4)
        await sparaBild(prefix + "-kund.png")
        let hamtad = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0].appendingPathComponent("hjerdal-prov.html")
        try? FileManager.default.removeItem(at: hamtad)
        _ = await js("""
            (() => {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob(['<p>prov</p>'], { type: 'text/html' }));
              a.download = 'hjerdal-prov.html';
              document.body.append(a);
              a.click();
              a.remove();
              return 'ok';
            })()
            """)
        await vanta(3)
        let finns = FileManager.default.fileExists(atPath: hamtad.path)
        try? FileManager.default.removeItem(at: hamtad)
        let fel = await js("JSON.stringify(window.__fel || [])")
        let text = await js("document.body.innerText.slice(0, 500)")
        print("Sida: \(webb?.url?.absoluteString ?? "-")")
        print("JavaScript-fel: \(fel)")
        print("Hämtad fil i Hämtade filer: \(finns ? "ja" : "nej")")
        print("Text:\n\(text)")
        exit(fel == "[]" && finns && !text.isEmpty ? 0 : 1)
    }
}

@main
enum Start {
    @MainActor
    static func main() {
        // Provkörningen i GitHub: programmets ikon som macOS visar den, till exempel i Dock.
        if let ikon = ProcessInfo.processInfo.environment["HJERDAL_PROV_IKON"] {
            var ram = NSRect(x: 0, y: 0, width: 512, height: 512)
            let bild = NSWorkspace.shared.icon(forFile: Bundle.main.bundlePath)
            bild.size = ram.size
            try? png(bild.cgImage(forProposedRect: &ram, context: nil, hints: nil))?.write(to: URL(fileURLWithPath: ikon))
            exit(0)
        }
        let app = NSApplication.shared
        let designer = Designer()
        app.delegate = designer
        app.setActivationPolicy(.regular)
        withExtendedLifetime(designer) {
            app.run()
        }
    }
}
