import Foundation

enum BikramSambatCalendar {
    enum ConversionError: Error, Equatable, LocalizedError {
        case unsupportedGregorianDate
        case unsupportedNepaliDate

        var errorDescription: String? {
            switch self {
            case .unsupportedGregorianDate:
                "This Gregorian date is outside Sajilo’s bundled calendar range."
            case .unsupportedNepaliDate:
                "This Bikram Sambat date is outside Sajilo’s bundled calendar range."
            }
        }
    }

    /// BS 1992–2090, roughly AD 1935–2034.
    static let supportedNepaliYears = 1992...2090

    /// Nepal’s Panchanga Nirnayak Samiti publishes the official calendar
    /// only about a year ahead. Every year through BS 2084 was checked against
    /// a published calendar month by month; BS 2085 onward was not, and the
    /// source datasets genuinely disagree there — in some years even on
    /// whether the year runs 365 or 366 days. Re-verify each against the
    /// official calendar as it is published, and extend the supported range
    /// only with the same check, never on library agreement alone.
    static let provisionalNepaliYears = 2085...2090

    private static let gregorian = NepalTime.calendar


    // 1992-01-01 BS = 1935-04-13 AD. Cross-checked against an independent
    // published reference (2000-01-01 BS = 1943-04-14 AD) that the table was
    // not fitted to. See THIRD_PARTY_NOTICES.md for the dataset provenance.
    private static let epoch = gregorian.date(from: DateComponents(year: 1935, month: 4, day: 13))!

    /// Month lengths in days, one row per year from `supportedNepaliYears`.
    /// Bikram Sambat months run 29–32 days with no closed-form rule, so the
    /// table is bundled data rather than computed.
    private static let monthLengths: [[Int]] = [
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 1992
        [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 1993
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 1994
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 1995
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 1996
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 1997
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 1998
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 1999
        [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2000
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2001
        [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2002
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2003
        [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2004
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2005
        [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2006
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2007
        [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31], // 2008
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2009
        [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2010
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2011
        [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2012
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2013
        [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2014
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2015
        [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2016
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2017
        [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2018
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2019
        [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2020
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2021
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2022
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2023
        [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2024
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2025
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2026
        [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2027
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2028
        [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30], // 2029
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2030
        [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2031
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2032
        [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2033
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2034
        [30, 32, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31], // 2035
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2036
        [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2037
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2038
        [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2039
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2040
        [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2041
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2042
        [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2043
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2044
        [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2045
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2046
        [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2047
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2048
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2049
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2050
        [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2051
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2052
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2053
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2054
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2055
        [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30], // 2056
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2057
        [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2058
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2059
        [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2060
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2061
        [30, 32, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31], // 2062
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2063
        [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2064
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2065
        [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31], // 2066
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2067
        [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2068
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2069
        [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2070
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2071
        [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2072
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2073
        [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2074
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2075
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2076
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2077
        [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2078
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2079
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2080
        [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2081
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2082
        [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2083
        [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30], // 2084
        [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 30, 30], // 2085
        [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30], // 2086
        [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30], // 2087
        [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30], // 2088
        [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30], // 2089
        [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30], // 2090
    ]

    /// Days elapsed from the epoch to the first day of each supported year,
    /// so a conversion is a binary-search-free single pass over one year
    /// rather than a re-summation of the whole table.
    private static let yearStartOffsets: [Int] = {
        var offsets: [Int] = []
        offsets.reserveCapacity(monthLengths.count)
        var total = 0
        for lengths in monthLengths {
            offsets.append(total)
            total += lengths.reduce(0, +)
        }
        return offsets
    }()

    private static let totalDays = yearStartOffsets.last! + monthLengths.last!.reduce(0, +)

    static func nepaliDate(from gregorianDate: Date) throws -> NepaliDate {
        let startOfInput = gregorian.startOfDay(for: gregorianDate)
        let dayOffset = gregorian.dateComponents([.day], from: epoch, to: startOfInput).day ?? 0
        guard dayOffset >= 0, dayOffset < totalDays else {
            throw ConversionError.unsupportedGregorianDate
        }

        // The last year whose start is at or before the target.
        var yearIndex = 0
        var low = 0
        var high = yearStartOffsets.count - 1
        while low <= high {
            let mid = (low + high) / 2
            if yearStartOffsets[mid] <= dayOffset {
                yearIndex = mid
                low = mid + 1
            } else {
                high = mid - 1
            }
        }

        var remainingDays = dayOffset - yearStartOffsets[yearIndex]
        for (monthIndex, monthLength) in monthLengths[yearIndex].enumerated() {
            if remainingDays < monthLength {
                return NepaliDate(
                    year: supportedNepaliYears.lowerBound + yearIndex,
                    month: monthIndex + 1,
                    day: remainingDays + 1
                )
            }
            remainingDays -= monthLength
        }
        throw ConversionError.unsupportedGregorianDate
    }

    static func gregorianDate(from nepaliDate: NepaliDate) throws -> Date {
        guard isValid(nepaliDate) else { throw ConversionError.unsupportedNepaliDate }

        let lengths = try monthLengths(for: nepaliDate.year)
        let dayOffset = yearStartOffsets[nepaliDate.year - supportedNepaliYears.lowerBound]
            + lengths.prefix(nepaliDate.month - 1).reduce(0, +)
            + nepaliDate.day - 1
        return gregorian.date(byAdding: .day, value: dayOffset, to: epoch)!
    }

    static func daysInMonth(year: Int, month: Int) -> Int? {
        guard let lengths = try? monthLengths(for: year), lengths.indices.contains(month - 1) else {
            return nil
        }
        return lengths[month - 1]
    }

    static func month(containing date: NepaliDate, today: NepaliDate) throws -> CalendarMonth {
        guard let numberOfDays = daysInMonth(year: date.year, month: date.month) else {
            throw ConversionError.unsupportedNepaliDate
        }
        let firstDate = NepaliDate(year: date.year, month: date.month, day: 1)
        let firstGregorianDate = try gregorianDate(from: firstDate)
        let leadingDays = gregorian.component(.weekday, from: firstGregorianDate) - 1
        let sourceEvents = CalendarEventStore.events(year: date.year, month: date.month)

        let blankDays = (0..<leadingDays).map { offset in
            CalendarDay(
                id: "blank-\(date.year)-\(date.month)-\(offset)",
                date: nil,
                adDay: nil,
                isToday: false,
                isHoliday: false,
                eventName: nil,
                tithi: nil
            )
        }
        let numberedDays = (1...numberOfDays).map { day in
            let bsDate = NepaliDate(year: date.year, month: date.month, day: day)
            let adDate = try? gregorianDate(from: bsDate)
            let sourceEvent = sourceEvents[day]
            return CalendarDay(
                id: "\(date.year)-\(date.month)-\(day)",
                date: bsDate,
                adDay: adDate.map { gregorian.component(.day, from: $0) },
                isToday: bsDate == today,
                isHoliday: (adDate.map { gregorian.component(.weekday, from: $0) == 7 } ?? false)
                    || (sourceEvent?.isPublicHoliday ?? false),
                eventName: sourceEvent?.name,
                tithi: sourceEvent?.tithi
            )
        }

        return CalendarMonth(
            firstDate: firstDate,
            title: "\(firstDate.nepaliMonthName) \(NepaliNumerals.string(from: date.year))",
            days: blankDays + numberedDays
        )
    }

    static func addingMonths(_ amount: Int, to date: NepaliDate) throws -> NepaliDate {
        let monthIndex = (date.year * 12) + (date.month - 1) + amount
        let year = monthIndex / 12
        let month = (monthIndex % 12) + 1
        guard supportedNepaliYears.contains(year) else { throw ConversionError.unsupportedNepaliDate }
        return NepaliDate(year: year, month: month, day: 1)
    }

    private static func isValid(_ date: NepaliDate) -> Bool {
        guard let numberOfDays = daysInMonth(year: date.year, month: date.month) else { return false }
        return (1...numberOfDays).contains(date.day)
    }

    private static func monthLengths(for year: Int) throws -> [Int] {
        guard supportedNepaliYears.contains(year) else { throw ConversionError.unsupportedNepaliDate }
        return monthLengths[year - supportedNepaliYears.lowerBound]
    }
}
