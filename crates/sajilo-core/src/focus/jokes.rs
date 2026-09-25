//! The lines a break card or notification says instead of the plain
//! instruction, when jokes are on.
//!
//! Each kind of break has its own deck, dealt in a shuffled order: every line
//! comes up once before any comes up again, the order changes each round, and
//! a round never opens with the line that closed the one before. Where the
//! deal has got to is kept in [`super::FocusState`], so a restart does not
//! start the deck over.

use std::collections::BTreeMap;

use super::BreakKind;

/// A deck needs at least this many lines for the no-repeat rule to hold
/// across rounds; a test keeps every deck above it.
pub const MIN_DECK: usize = 3;

/// The longest a line may run and still sit comfortably on the card.
pub const MAX_LINE: usize = 110;

/// The deck for `kind`. The user's own reminder is their words, not ours, so
/// it has none.
pub fn lines(kind: BreakKind) -> &'static [&'static str] {
    match kind {
        BreakKind::Eyes => EYES,
        BreakKind::Move => MOVE,
        BreakKind::Water => WATER,
        BreakKind::EndOfDay => END_OF_DAY,
        BreakKind::Breakfast => BREAKFAST,
        BreakKind::Lunch => LUNCH,
        BreakKind::Dinner => DINNER,
        BreakKind::Bedtime => BEDTIME,
        BreakKind::Custom => &[],
    }
}

/// The deck name a kind's deal is remembered under.
pub fn deck_name(kind: BreakKind) -> &'static str {
    match kind {
        BreakKind::Eyes => "eyes",
        BreakKind::Move => "move",
        BreakKind::Water => "water",
        BreakKind::EndOfDay => "endOfDay",
        BreakKind::Breakfast => "breakfast",
        BreakKind::Lunch => "lunch",
        BreakKind::Dinner => "dinner",
        BreakKind::Bedtime => "bedtime",
        BreakKind::Custom => "custom",
    }
}

/// The deck for the line a card says once its break is taken.
pub const DONE_DECK: &str = "done";

/// Deals the next line from a deck and moves the deal on; `None` for an
/// empty deck.
pub(super) fn deal(
    told: &mut BTreeMap<String, u32>,
    deck: &str,
    lines: &'static [&'static str],
) -> Option<String> {
    if lines.is_empty() {
        return None;
    }
    let turn = told.entry(deck.to_owned()).or_insert(0);
    let line = lines[position(deck, *turn, lines.len())];
    *turn = turn.wrapping_add(1);
    Some(line.to_owned())
}

/// Which line the `turn`th deal from a deck of `len` lines lands on.
pub fn position(deck: &str, turn: u32, len: usize) -> usize {
    let len_u32 = u32::try_from(len).unwrap_or(u32::MAX);
    let round = turn / len_u32;
    let mut order = shuffled(seed(deck, round), len);
    // Swapping the first two leaves the last in place for any deck of three
    // or more, so the previous round's plain shuffle is its real last line.
    if round > 0 && len >= MIN_DECK {
        let previous = shuffled(seed(deck, round - 1), len);
        if order[0] == previous[len - 1] {
            order.swap(0, 1);
        }
    }
    order[(turn % len_u32) as usize]
}

fn seed(deck: &str, round: u32) -> u64 {
    // FNV-1a over the name, so each deck shuffles differently.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in deck.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    hash ^ u64::from(round).wrapping_mul(0x9e37_79b9_7f4a_7c15)
}

/// A Fisher–Yates shuffle of `0..len`, driven by splitmix64.
fn shuffled(mut state: u64, len: usize) -> Vec<usize> {
    let mut next = || {
        state = state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = state;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    };
    let mut order: Vec<usize> = (0..len).collect();
    for i in (1..len).rev() {
        let j = (next() % (i as u64 + 1)) as usize;
        order.swap(i, j);
    }
    order
}

pub const EYES: &[&str] = &[
    "Look away now, or pay Rs 3,000 for a chasma you'll leave in a micro.",
    "Rest your eyes, or explain to Aama why you need glasses at 25.",
    "Look at something far away. In Kathmandu that's the building next door, but it counts.",
    "A few seconds away from the screen. Even Loksewa exams give you more breaks than this.",
    "Blink. Your eyes are drier than a Kathmandu tap in Chaitra.",
    "Look out the window. If you can see the Himalayas, take a photo. It won't happen again till monsoon.",
    "Stare into the distance like a dai waiting for his visa result.",
    "The Tilganga queue is two months long. Look away now instead.",
    "Twenty seconds of looking far away is cheaper than any eye drops on Daraz.",
    "Look away. Even your manager blinks sometimes.",
    "Rest your eyes. NEPSE will still be red when you look back.",
    "Look away from the screen. The email you're pretending to read will wait.",
    "Find the nearest electric pole and try to trace one wire. That's twenty seconds gone.",
    "Look far away. Far like the Sydney your cousin keeps posting from.",
    "Stare at the wall like it owes you money.",
    "Look away. The spreadsheet will still be wrong in twenty seconds.",
    "Blink slowly, like an aunty hearing your salary at a bratabandha.",
    "Look into the distance like a cricket fan waiting for the rain to stop in Kirtipur.",
    "Rest your eyes. Staring harder does not make the code compile.",
    "Look away. You've read that same line three times anyway.",
    "Look far off, the way you look at your bank balance after Dashain shopping.",
    "Close your eyes for a bit. Pretend it's a power cut from 2012.",
    "Look at something 6 metres away. The momo pasal across the road is about that far.",
    "Your eyes have worked harder than a micro conductor shouting \"Kalanki, Kalanki\". Rest them.",
    "Look away before your eyes start buffering like YouTube on hotel Wi-Fi in Pokhara.",
    "Twenty seconds away from the screen. Shorter than any billing queue at Bhatbhateni.",
    "Look away. Your screen brightness and your life choices both need adjusting.",
    "Look away now. Nobody has ever been promoted for staring.",
    "Rest your eyes. The Excel sheet does not love you back.",
    "Look far away and squint. Let everyone think you're having a big idea.",
    "Look up at the ceiling fan. It's been working all day too; show some respect.",
    "Eyes off the screen. The message you're waiting for is not coming, dai.",
    "Look out the window and count the houses with rods sticking out of the roof. You'll lose count.",
    "Give your eyes a break. They didn't sign up for 47 open tabs.",
];

pub const MOVE: &[&str] = &[
    "You've been sitting longer than a Sajha bus waiting at Ratnapark.",
    "Your back is starting to sound like a Pulsar on a cold morning.",
    "Get up. At this rate you'll need a physio before a promotion.",
    "Even the office peon has walked more than you today.",
    "Your hajurbuwa walked from Gorkha to Kathmandu. You can make it to the kitchen.",
    "Stretch now, or your neck stays stuck in the reading-WhatsApp position.",
    "Take a lap. Even Kathmandu traffic moved more than you this hour.",
    "Walk to the window and back. That's more than your gym membership got this month.",
    "Get up and refill your chiya. See, breaks can be selfish.",
    "Your legs have gone to sleep. Wake them before they apply for DV.",
    "Stand up. People stand up for the national anthem; do it once for your spine.",
    "Stretch. You're folded like a letter from Hulak that never got delivered.",
    "Stand up. Your chair has started to take your shape.",
    "Walk around. Your step count today is lower than the number of tabs you have open.",
    "Even the street dogs of Thamel stretch more than you, and they sleep all day.",
    "Stretch like you just got off a fourteen-hour night bus from Kakarbhitta.",
    "Do a lap of the room. Pretend it's Boudha and you're earning a little merit.",
    "Your hips are locked tighter than a government office at 4:59.",
    "Walk to the kitchen, open the fridge, close it. Congratulations, that was cardio.",
    "Your knees sound like a Maruti 800 going up Chandragiri. Move them before they stop.",
    "Go up to the terrace and check the water tank. Someone has to, and it's you.",
    "Stand up and do ten squats. Or two. We're not your PT sir.",
    "Your posture is a question mark. Be an exclamation mark for two minutes.",
    "Walk around. Your blood is moving slower than Ring Road at five o'clock.",
    "Get up. The tortoise at Central Zoo got more steps in today.",
    "Stand up and look busy somewhere else for two minutes.",
    "Go stand on the balcony and judge the neighbours' clothesline. It's tradition.",
    "Porters on the Everest trail carry 60 kg with better posture than you. Stand up straight.",
    "Get up before your spine files a complaint with Hello Sarkar.",
    "Walk it off. The email, the meeting, the second plate of bhat. All of it.",
    "Stand up. Your chair needs a break from you too.",
    "Walk to the printer and back. In this office, that's a trek.",
];

pub const WATER: &[&str] = &[
    "Drink water. Chiya is not a food group.",
    "Melamchi finally reached Kathmandu. The least you can do is drink some.",
    "Drink up, or Aama will blame every headache you ever get on this moment.",
    "One glass now. Your body is 60% water, not 60% chiya.",
    "Drink a glass. The jar-water dai visits more often than you drink.",
    "Hydrate. Your kidneys don't have a union yet, but they're thinking about it.",
    "Drink water. Momo achar is not a liquid.",
    "You're drier than a Tarai field in Jestha. Drink something.",
    "A glass of water now saves a Rs 50 headache pill later.",
    "Drink up. Your skin is starting to look like a Kalimati potato.",
    "Even the tulsi plant gets watered more than you.",
    "Water is the one thing in Kathmandu not stuck in traffic. Drink it.",
    "Take a sip. Not of chiya. Water. We'll know.",
    "Drink up. Pokhara has an entire lake; you can manage one glass.",
    "Your body is not a tanker. It can't wait for the next delivery.",
    "Hydrate. The bottle on your desk is not a decoration.",
    "Even the Bagmati in winter has more water in it than you do.",
    "Drink up. Your brain is 75% water and currently running on 40%.",
    "One glass. Dehydration makes headaches, and headaches make bad emails.",
    "Three chiya, zero water. Your kidneys are drafting a resignation letter.",
    "Drink water. Aama already asked. This is the official reminder.",
    "Refill the bottle. It's been empty since Monday; we noticed.",
    "You paid for that jar of water. Get your money's worth.",
    "Drink up before your lips crack like the roads after monsoon.",
    "Take a sip. You're a person, not a cactus from a Thamel souvenir shop.",
    "Water, please. You cannot run on momo jhol alone. People have tried.",
    "A glass of water is free, healthy and needs no delivery charge. Drink one.",
    "Sip, sip, sip. Your desk plant is getting jealous.",
    "Tomorrow's you, stuck at Kalanki with a headache, says thanks for this glass.",
];

pub const DONE: &[&str] = &[
    "Shabash. Your physio's EMI just got harder to pay.",
    "Back already? The meeting didn't miss you either.",
    "Nice. Your future self just said thank you.",
    "Good. Add that to your CV under self-care.",
    "Well done. Aama would be proud. Mildly.",
    "Done. Your chair missed you, though.",
    "Look at you, following instructions. Rare.",
    "Break taken. Post it on LinkedIn; everyone else would.",
    "Nice. Your spine sends its regards.",
    "Well done. That's more discipline than the whole of Ring Road.",
    "There you go. Your eyes say dhanyabad.",
    "Health +1. Productivity unaffected, we promise.",
    "Done. Aama won't have to say it this time.",
    "Proud of you. Don't let it go to your head.",
    "Good job. Healthiest thing you've done since Tihar.",
    "Break complete. Your doctor just lost a future customer.",
    "See? Easy. Now don't sit for six hours straight.",
    "Well done. You've earned a chiya. Kidding. Water.",
    "Nice one. Your back just moved you up its favourites list.",
];

pub const END_OF_DAY: &[&str] = &[
    "The email can wait. It waited all day for you.",
    "Go home. The office chair will still be here tomorrow, unfortunately.",
    "Log off before your boss remembers one more thing.",
    "Nobody ever got promoted for being online till 9.",
    "Time to go. Beat the Koteshwor jam, or at least join it early.",
    "Your shift is over. The work isn't, and that's tomorrow's problem.",
    "Close the laptop. The sun clocked out already; follow its lead.",
    "Log off. Nobody will read that email tonight, including you.",
    "Go home. The Wi-Fi there is worse, which is a feature.",
    "Shut it down. Your family has only seen the back of your laptop all week.",
    "Time's up. Even Singha Durbar went home hours ago.",
    "Pack up. The last micro won't wait for you, and neither should your evening.",
    "Stop working. You're not paid for overtime, emotionally or financially.",
    "Done for the day. If it's urgent, they'll call. They always call.",
];

pub const BREAKFAST: &[&str] = &[
    "Food first, laptop later. House rule.",
    "Chiya and a biscuit is not breakfast, no matter how you arrange it.",
    "Your emails were not hungry all night. You were.",
    "Eat something. The standup meeting will survive without you for ten minutes.",
    "Breakfast first. Nobody should read email on an empty stomach.",
    "Eat. The pigeons at Basantapur had breakfast hours ago.",
    "Have breakfast. Yesterday's cold chiya doesn't count.",
    "Food, now. Sel roti, chiura, anything. The laptop can wait.",
    "Eat breakfast. Your brain runs on glucose, not optimism.",
];

pub const LUNCH: &[&str] = &[
    "Dal bhat power, 24 hour. But only if you actually eat it.",
    "Have you eaten? 'Later' is not a time.",
    "The canteen didi is closing the pot. Go.",
    "Eating at your desk counts as a meeting with your keyboard. Go eat elsewhere.",
    "Lunch. Dal bhat, extra tarkari, no laptop.",
    "Go eat. Nobody in history has regretted the second serving of bhat.",
    "Lunch break. Legally, emotionally and spiritually required.",
    "Eat something that isn't Wai Wai. Or do; we're not your mother.",
    "It's lunch. The khaja ghar is open and the momos won't eat themselves.",
];

pub const DINNER: &[&str] = &[
    "Dinner time. The screen can watch itself for a while.",
    "Aama has called you to eat twice already. This is the third time.",
    "Close the laptop and eat with the family. They're more interesting than your inbox.",
    "Eat now, before dinner becomes a midnight Wai Wai.",
    "Dinner. Put the phone face down too; we know about the phone.",
    "Eat with people, not with tabs.",
    "The family group chat is not dinner conversation. Go to the table.",
    "Laptop down, plate up.",
    "Go eat. The tarkari has been reheated twice already.",
];

pub const BEDTIME: &[&str] = &[
    "Laptop off. The internet will still be there tomorrow.",
    "It's late. Nothing good has ever been decided after 11 on a laptop.",
    "Go to sleep. The load-shedding generation managed; so can you.",
    "Sleep now, or tomorrow you'll be the person nodding off in the 10 o'clock meeting.",
    "Sleep. The next reel is the same as the last hundred.",
    "Bedtime. Your bed misses you more than your manager does.",
    "Go to sleep. Tomorrow's traffic will need all your patience.",
    "Lights off. The dogs outside will bark all night anyway; get a head start.",
    "It's late. Close the laptop before you start another \"quick fix\".",
    "Sleep now. Staying up doesn't make tomorrow come any later.",
    "Bed. Load-shedding used to decide your bedtime; now it's us.",
];
