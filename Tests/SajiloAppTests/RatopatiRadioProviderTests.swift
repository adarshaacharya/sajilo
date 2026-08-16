import Foundation
import Testing
@testable import SajiloApp

struct RatopatiRadioProviderTests {
    @Test func readsStationsFromTheDirectory() {
        let stations = RatopatiRadioProvider.parseDirectory("""
        <div class="radio-col"><a href="https://www.ratopati.com/radio/radio-nepal">
          <img alt="रेडियो नेपाल" src="https://npcdn.ratopati.com/media/radio/radio-nepal.png">
          <span>रेडियो नेपाल</span> 100 MHz
        </a></div>
        <div class="radio-col"><a href="https://www.ratopati.com/radio/hits-fm">
          <img alt="हिट्स एफएम" src="https://npcdn.ratopati.com/media/radio/hits-fm.png">
          <span>हिट्स एफएम</span> 91.2 MHz
        </a></div>
        """)

        #expect(stations.map(\.slug) == ["radio-nepal", "hits-fm"])
        #expect(stations.map(\.name) == ["रेडियो नेपाल", "हिट्स एफएम"])
        #expect(stations.first?.frequency == "100 MHz")
        #expect(stations.first?.logoURL?.host == "npcdn.ratopati.com")
    }

    @Test func keepsOneStationWhenTheDirectoryRepeatsItsFeaturedRows() {
        let row = """
        <a href="https://www.ratopati.com/radio/radio-nepal">
          <img alt="रेडियो नेपाल" src="https://example.com/logo.png"><span>रेडियो नेपाल</span> 100 MHz
        </a>
        """

        #expect(RatopatiRadioProvider.parseDirectory(row + row).count == 1)
    }

    @Test func readsOnlyAWebAudioSource() {
        #expect(
            RatopatiRadioProvider.parseStreamURL(#"<audio><source src="https://stream1.radionepal.gov.np/live/"></audio>"#)
                == URL(string: "https://stream1.radionepal.gov.np/live/")
        )
        #expect(RatopatiRadioProvider.parseStreamURL("<audio></audio>") == nil)
        #expect(RatopatiRadioProvider.parseStreamURL(#"<source src="file:///tmp/audio.mp3">"#) == nil)
    }
}
