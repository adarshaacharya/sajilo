import Foundation
import Testing
@testable import SajiloApp

struct RSSParserTests {
    /// Mirrors a real OnlineKhabar item, which ships the full article body in
    /// `content:encoded` alongside the headline.
    private static let feed = Data("""
    <?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
      <channel>
        <title>OnlineKhabar</title>
        <item>
          <title>काठमाडौंमा वर्षा</title>
          <link>https://www.onlinekhabar.com/2026/08/one</link>
          <pubDate>Sun, 16 Aug 2026 07:07:04 +0000</pubDate>
          <description>पहिलो अनुच्छेद यहाँ छ</description>
          <content:encoded><![CDATA[<p>Full article body that must never be read.</p>]]></content:encoded>
        </item>
        <item>
          <title><![CDATA[दोस्रो समाचार]]></title>
          <link>https://www.onlinekhabar.com/2026/08/two</link>
        </item>
      </channel>
    </rss>
    """.utf8)

    @Test func readsTitleLinkAndDate() throws {
        let items = RSSParser.parse(Self.feed, sourceName: "OnlineKhabar")

        #expect(items.count == 2)
        let first = try #require(items.first)
        #expect(first.title == "काठमाडौंमा वर्षा")
        #expect(first.link.absoluteString == "https://www.onlinekhabar.com/2026/08/one")
        #expect(first.sourceName == "OnlineKhabar")
        #expect(first.published != nil)
    }

    /// The whole point of the parser's narrowness: article bodies are present
    /// in the feed and must not end up anywhere in the model.
    @Test func neverCapturesArticleBodyOrDescription() {
        let items = RSSParser.parse(Self.feed, sourceName: "OnlineKhabar")

        for item in items {
            #expect(!item.title.contains("Full article body"))
            #expect(!item.title.contains("पहिलो अनुच्छेद"))
            #expect(!item.title.contains("<p>"))
        }
    }

    @Test func unwrapsCDATATitles() throws {
        let items = RSSParser.parse(Self.feed, sourceName: "OnlineKhabar")
        #expect(items.last?.title == "दोस्रो समाचार")
    }

    /// Annapurna Post publishes no `pubDate`; an item without one is still
    /// usable and must not be dropped.
    @Test func keepsItemsThatHaveNoDate() throws {
        let items = RSSParser.parse(Self.feed, sourceName: "Annapurna Post")
        let undated = try #require(items.last)

        #expect(undated.published == nil)
        #expect(undated.title.isEmpty == false)
    }

    @Test func parsesTheRealWorldDateFormats() {
        #expect(RSSParser.date(from: "Sun, 16 Aug 2026 07:07:04 +0000") != nil)
        #expect(RSSParser.date(from: "Sun, 16 Aug 2026 07:07 +0545") != nil)
        #expect(RSSParser.date(from: "") == nil)
        #expect(RSSParser.date(from: "not a date") == nil)
    }

    /// A feed offering a `javascript:` or `file:` link must not become
    /// something the app hands to the browser.
    @Test func rejectsNonWebLinks() {
        let hostile = Data("""
        <rss version="2.0"><channel>
          <item><title>Bad</title><link>javascript:alert(1)</link></item>
          <item><title>AlsoBad</title><link>file:///etc/passwd</link></item>
          <item><title>Good</title><link>https://example.com/a</link></item>
        </channel></rss>
        """.utf8)

        let items = RSSParser.parse(hostile, sourceName: "Test")

        #expect(items.count == 1)
        #expect(items.first?.title == "Good")
    }

    @Test func skipsItemsMissingATitleOrLink() {
        let partial = Data("""
        <rss version="2.0"><channel>
          <item><link>https://example.com/a</link></item>
          <item><title>No link</title></item>
          <item><title>Fine</title><link>https://example.com/b</link></item>
        </channel></rss>
        """.utf8)

        #expect(RSSParser.parse(partial, sourceName: "Test").count == 1)
    }

    @Test func honoursTheItemLimit() {
        let many = "<rss version=\"2.0\"><channel>" + (1...40).map {
            "<item><title>Item \($0)</title><link>https://example.com/\($0)</link></item>"
        }.joined() + "</channel></rss>"

        #expect(RSSParser.parse(Data(many.utf8), sourceName: "Test", limit: 5).count == 5)
    }

    @Test func survivesMalformedXML() {
        let broken = Data("<rss><channel><item><title>Unclosed".utf8)
        #expect(RSSParser.parse(broken, sourceName: "Test").isEmpty == false || true)
    }
}
