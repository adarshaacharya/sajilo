//! The lines a break card or notification says instead of the plain
//! instruction, when jokes are on.
//!
//! Each kind of break has its own deck, dealt in a shuffled order: every line
//! comes up once before any comes up again, the order changes each round, and
//! a round never opens with the line that closed the one before. Where the
//! deal has got to is kept in [`super::FocusState`], so a restart does not
//! start the deck over.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::{BreakKind, Language};

/// A deck needs at least this many lines for the no-repeat rule to hold
/// across rounds; a test keeps every deck above it.
pub const MIN_DECK: usize = 3;

/// The longest a line may run. A joke that needs more than two lines on
/// the card is explaining itself.
pub const MAX_LINE: usize = 90;

/// One joke in each language the app speaks: English first, then Nepali.
pub type Line = (&'static str, &'static str);

/// A dealt joke, carried on a card in both languages so it can be shown in
/// whichever one the app is set to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Joke {
    pub en: String,
    pub ne: String,
}

impl Joke {
    pub fn text(&self, language: Language) -> &str {
        match language {
            Language::En => &self.en,
            Language::Ne => &self.ne,
        }
    }
}

/// The deck for `kind`. The user's own reminder is their words, not ours, so
/// it has none.
pub fn lines(kind: BreakKind) -> &'static [Line] {
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
    lines: &'static [Line],
) -> Option<Joke> {
    if lines.is_empty() {
        return None;
    }
    let turn = told.entry(deck.to_owned()).or_insert(0);
    let (en, ne) = lines[position(deck, *turn, lines.len())];
    *turn = turn.wrapping_add(1);
    Some(Joke {
        en: en.to_owned(),
        ne: ne.to_owned(),
    })
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

pub const EYES: &[Line] = &[
    (
        "Blink. Your eyes are drier than a Kathmandu tap in Chaitra.",
        "आँखा झिम्काउनुहोस्। चैतको काठमाडौंको धाराभन्दा सुख्खा भइसक्यो।",
    ),
    (
        "Stare into the distance like someone waiting for a visa result.",
        "भिसाको रिजल्ट पर्खिरहेको मान्छेजस्तै टाढा टोलाउनुहोस्।",
    ),
    (
        "Look away now, or pay Rs 3,000 for a chasma you'll leave in a micro.",
        "अहिले टाढा हेर्नुहोस्, नत्र ३ हजारको चस्मा किन्नुपर्छ, जुन माइक्रोमै छुट्छ।",
    ),
    (
        "Rest your eyes, or start budgeting for glasses at 25.",
        "आँखालाई आराम दिनुहोस्, नत्र २५ मै चस्माको बजेट छुट्याउनुपर्छ।",
    ),
    (
        "Look at something far away. In Kathmandu, the next building counts.",
        "टाढाको कुनै चीज हेर्नुहोस्। काठमाडौंमा छेउको घर पनि चल्छ।",
    ),
    (
        "Look out the window. Can you see the Himalayas? No? Welcome to Kathmandu.",
        "झ्यालबाहिर हेर्नुहोस्। हिमाल देखियो? देखिएन? काठमाडौंमा स्वागत छ।",
    ),
    (
        "Stare at the wall like it owes you money.",
        "भित्ताले तपाईंको पैसा तिर्न बाँकी भएजस्तो गरी एकटक हेर्नुहोस्।",
    ),
    (
        "Look away. You've read that same line three times anyway.",
        "टाढा हेर्नुहोस्। त्यही लाइन तीनपटक पढिसक्नुभयो।",
    ),
    (
        "Rest your eyes. Staring harder won't make the code compile.",
        "आँखा आराम गर्नुहोस्। जति घुरे पनि कोड कम्पाइल हुँदैन।",
    ),
    (
        "Look away. The spreadsheet will still be wrong in twenty seconds.",
        "टाढा हेर्नुहोस्। बीस सेकेन्डपछि पनि स्प्रेडसिट गलत नै हुनेछ।",
    ),
    (
        "Find an electric pole and trace one wire. See you in twenty seconds.",
        "बिजुलीको पोल हेरेर एउटा तार पछ्याउनुहोस्। बीस सेकेन्डमा भेटौंला।",
    ),
    (
        "Blink slowly, like a loan officer reading your salary slip.",
        "तलबको स्लिप पढ्ने बैंकको कर्मचारीजस्तै बिस्तारै आँखा झिम्काउनुहोस्।",
    ),
    (
        "Close your eyes. Pretend it's load-shedding and there's nothing else to do.",
        "आँखा चिम्लनुहोस्। लोडसेडिङ भएजस्तो ठान्नुहोस्, अरू गर्ने केही छैन।",
    ),
    (
        "Look far away. Not Sydney far. Just across the room.",
        "टाढा हेर्नुहोस्। सिड्नी जत्ति टाढा होइन, कोठाको पल्लो छेउसम्म।",
    ),
    (
        "Squint at something far away. People will think you're having a big idea.",
        "टाढा केही हेरेर आँखा सानो पार्नुहोस्। मान्छेले ठूलो आइडिया आयो भन्ठान्छन्।",
    ),
    (
        "Eyes off the screen. The reply you're waiting for isn't coming.",
        "स्क्रिनबाट नजर हटाउनुहोस्। पर्खिरहेको रिप्लाई आउँदैन।",
    ),
    (
        "Rest your eyes. NEPSE will still be red when you look back.",
        "आँखा आराम गर्नुहोस्। फर्केर हेर्दा पनि नेप्से रातै हुनेछ।",
    ),
    (
        "The Tilganga queue is two months long. Look away now instead.",
        "तिलगंगामा दुई महिनाको लाइन छ। बरु अहिले नै टाढा हेर्नुहोस्।",
    ),
    (
        "Look away. The screen is not going to blink first.",
        "टाढा हेर्नुहोस्। स्क्रिनले पहिले आँखा झिम्काउने छैन।",
    ),
    (
        "Blink twice if your manager is watching. Then look away for twenty seconds.",
        "म्यानेजरले हेरिरहेको छ भने दुईपटक आँखा झिम्काउनुहोस्। अनि बीस सेकेन्ड टाढा हेर्नुहोस्।",
    ),
    (
        "Look at something green. A plant, a tree, an army truck. Anything.",
        "केही हरियो हेर्नुहोस्। बिरुवा, रूख, सेनाको ट्रक। जे भए पनि।",
    ),
    (
        "Rest your eyes. The email will still be passive-aggressive in twenty seconds.",
        "आँखा आराम गर्नुहोस्। बीस सेकेन्डपछि पनि त्यो इमेल घुमाउरो पारामा रिसाएकै हुनेछ।",
    ),
    (
        "Count the unfinished houses out the window. Actually don't, it'd take all day.",
        "झ्यालबाहिरका अधुरा घर गन्नुहोस्। होइन, नगन्नुहोस्, दिनभर लाग्छ।",
    ),
    (
        "Look away. Your screen has seen enough of your face today.",
        "टाढा हेर्नुहोस्। स्क्रिनले आज तपाईंको अनुहार धेरै देखिसक्यो।",
    ),
    (
        "Nobody ever got promoted for not blinking. Look away.",
        "आँखा नझिम्काएर कसैको प्रमोसन भएको छैन। टाढा हेर्नुहोस्।",
    ),
];

pub const MOVE: &[Line] = &[
    (
        "Your back is starting to sound like a Pulsar on a cold morning.",
        "तपाईंको ढाड जाडो बिहानको पल्सरजस्तै आवाज निकाल्न थाल्यो।",
    ),
    (
        "You've been sitting longer than a Sajha bus at Ratnapark.",
        "रत्नपार्कमा यात्रु पर्खिरहेको साझा बसभन्दा धेरै बेर बस्नुभयो।",
    ),
    (
        "Get up. At this rate you'll need a physio before a promotion.",
        "उठ्नुहोस्। यसरी त प्रमोसनभन्दा पहिले फिजियो चाहिन्छ।",
    ),
    (
        "People once walked from Gorkha to Kathmandu. You can make it to the kitchen.",
        "मान्छेहरू गोरखाबाट काठमाडौं हिँडेरै आउँथे। तपाईं भान्सासम्म त पुग्न सक्नुहुन्छ।",
    ),
    (
        "Stretch, or your neck stays stuck in the reading-WhatsApp position.",
        "तन्किनुहोस्, नत्र घाँटी ह्वाट्सएप पढ्ने पोजमै अड्किन्छ।",
    ),
    (
        "Your legs have gone to sleep. Wake them before they apply for DV.",
        "खुट्टा निदाइसके। डिभी भर्नुअघि ब्युँझाउनुहोस्।",
    ),
    (
        "You stand up for the national anthem. Do it once for your spine.",
        "राष्ट्रिय गानमा त उठ्नुहुन्छ। एकपटक ढाडका लागि पनि उठ्नुहोस्।",
    ),
    (
        "Get up and refill your chiya. See, breaks can be selfish.",
        "उठेर अर्को कप चिया थप्नुहोस्। हेर्नुस्, ब्रेक आफ्नै फाइदाका लागि पनि हुन सक्छ।",
    ),
    (
        "Walk to the window and back. More than your gym membership got this month.",
        "झ्यालसम्म गएर फर्किनुहोस्। यो महिना जिमको मेम्बरसिपले पाएभन्दा बढी हो।",
    ),
    (
        "Your chair is starting to take your shape. Stand up before it's permanent.",
        "कुर्सीले तपाईंकै आकार लिन थाल्यो। स्थायी हुनुअघि उठ्नुहोस्।",
    ),
    (
        "Stretch like you just got off a night bus from Kakarbhitta.",
        "काँकडभिट्टाको रात्रिबसबाट भर्खर झरेजस्तो गरी तन्किनुहोस्।",
    ),
    (
        "Your hips are locked tighter than a government office at 4:59.",
        "तपाईंको कम्मर ४:५९ को सरकारी अफिसभन्दा कडा बन्द छ।",
    ),
    (
        "Open the fridge, stare, close it. Congratulations, that was cardio.",
        "फ्रिज खोल्नुहोस्, हेर्नुहोस्, बन्द गर्नुहोस्। बधाई छ, त्यो कार्डियो थियो।",
    ),
    (
        "Go check the water tank on the roof. Someone has to, and today it's you.",
        "छतमा गएर पानीको ट्याङ्की हेर्नुहोस्। कसैले त हेर्नुपर्छ, आज तपाईंको पालो।",
    ),
    (
        "Ten squats. Or two. We're not your PT sir.",
        "दसवटा स्क्वाट। या दुईवटा। हामी तपाईंका पीटी सर होइनौं।",
    ),
    (
        "Go to the balcony and judge the neighbours' clothesline. It's cultural.",
        "बार्दलीमा गएर छिमेकीको लुगा सुकाउने डोरी नियाल्नुहोस्। यो त संस्कृति हो।",
    ),
    (
        "Porters carry 60 kg to Namche with better posture than you. Stand up.",
        "भरियाहरू ६० केजी बोकेर पनि तपाईंभन्दा सिधा भएर नाम्चे पुग्छन्। उठ्नुहोस्।",
    ),
    (
        "Get up before your spine files a complaint on Hello Sarkar.",
        "ढाडले हेलो सरकारमा उजुरी हाल्नुअघि उठ्नुहोस्।",
    ),
    (
        "Stand up and look busy somewhere else for two minutes.",
        "उठेर दुई मिनेट अन्तै कतै व्यस्त देखिनुहोस्।",
    ),
    (
        "Stand up. Your knees already sound like a Maruti 800 on Chandragiri.",
        "उठ्नुहोस्। घुँडा चन्द्रागिरि उक्लँदै गरेको मारुति ८०० जस्तै कराउन थाले।",
    ),
    (
        "Get up. Sitting all day is how \"gastric\" starts.",
        "उठ्नुहोस्। दिनभर बस्दा नै ग्यास्ट्रिक सुरु हुन्छ।",
    ),
    (
        "Walk around like you're looking for your chappal. You know the walk.",
        "चप्पल खोजेजस्तो गरी यताउता हिँड्नुहोस्। त्यो हिँडाइ त थाहा छ नि।",
    ),
    (
        "Stand up and stretch. Loud groaning is allowed.",
        "उठेर तन्किनुहोस्। ठूलो स्वरले कन्न पाइन्छ।",
    ),
];

pub const WATER: &[Line] = &[
    (
        "Drink water. Chiya is not a food group.",
        "पानी पिउनुहोस्। चिया खानेकुराको समूह होइन।",
    ),
    (
        "One glass now. You're 60% water, not 60% chiya.",
        "अहिले एक गिलास। शरीर ६० प्रतिशत पानी हो, चिया होइन।",
    ),
    (
        "Drink water. Momo achar is not a liquid.",
        "पानी पिउनुहोस्। मःमको अचार तरल पदार्थ होइन।",
    ),
    (
        "You're drier than a Tarai field in Jestha. Drink something.",
        "जेठको तराईको खेतभन्दा सुख्खा हुनुभयो। केही पिउनुहोस्।",
    ),
    (
        "Melamchi finally reached Kathmandu. The least you can do is drink some.",
        "मेलम्ची बल्ल काठमाडौं आइपुग्यो। कम्तीमा अलिकति पिइदिनुहोस्।",
    ),
    (
        "Hydrate. Your kidneys don't have a union yet, but they're organising.",
        "पानी पिउनुहोस्। मिर्गौलाको युनियन छैन, तर बनाउने सोचमा छन्।",
    ),
    (
        "The jar-water delivery comes more often than you drink. Fix that.",
        "तपाईं पानी पिउनेभन्दा धेरैपटक त जारपानी आउँछ। सच्याउनुहोस्।",
    ),
    (
        "Hydrate. The bottle on your desk is not a decoration.",
        "पानी पिउनुहोस्। डेस्कको बोतल सजावटको सामान होइन।",
    ),
    (
        "Official notice from the Department of Body Water Supply: drink up.",
        "तपाईंको शरीरबाट सूचना: पानी पठाइदिनुहोस्।",
    ),
    (
        "Refill the bottle. It's been empty since Monday; we noticed.",
        "बोतल भर्नुहोस्। सोमबारदेखि खाली छ, हामीले देखेका छौं।",
    ),
    (
        "You paid for that jar of water. Get your money's worth.",
        "त्यो जारपानीको पैसा तिर्नुभएको हो। पैसा असुल गर्नुहोस्।",
    ),
    (
        "Take a sip. Of water. Not chiya. We'll know.",
        "एक घुट्को। पानीको। चियाको होइन। हामीलाई थाहा हुन्छ।",
    ),
    (
        "Pokhara has a whole lake. You can manage one glass.",
        "पोखरासँग पूरै ताल छ। तपाईं एक गिलास त पिउन सक्नुहुन्छ।",
    ),
    (
        "Drink up. Dehydration causes headaches, and headaches cause bad emails.",
        "पानी पिउनुहोस्। तिर्खाले टाउको दुख्छ, टाउको दुखेपछि नराम्रो इमेल लेखिन्छ।",
    ),
    (
        "The tulsi gets watered more often than you do.",
        "तुलसीको मोठलाई पनि तपाईंलाई भन्दा धेरै पानी हालिन्छ।",
    ),
    (
        "Water is the one thing in Kathmandu not stuck in traffic. Drink it.",
        "काठमाडौंमा जाममा नअड्किने एउटै चीज पानी हो। पिइहाल्नुहोस्।",
    ),
    (
        "Drink water. It should not come out the colour of chiya.",
        "पानी पिउनुहोस्। बाहिर निस्कँदा चियाको रङ हुनु हुँदैन।",
    ),
    (
        "The Bagmati in winter has more water in it than you. Drink up.",
        "जाडोको बागमतीमा पनि तपाईंमा भन्दा धेरै पानी छ। पिउनुहोस्।",
    ),
    (
        "A glass now saves a Rs 50 headache pill later.",
        "अहिलेको एक गिलासले पछिको ५० रुपैयाँको टाउको दुखाइको चक्की बचाउँछ।",
    ),
    (
        "You are not a cactus. Drink water.",
        "तपाईं सिउँडी होइन। पानी पिउनुहोस्।",
    ),
];

pub const DONE: &[Line] = &[
    (
        "Shabash. Your physio's EMI just got harder to pay.",
        "स्याबास। तपाईंको फिजियोलाई EMI तिर्न गाह्रो भयो।",
    ),
    (
        "Nice. Your future self says thank you.",
        "राम्रो। भविष्यको तपाईंले धन्यवाद भन्नुभयो।",
    ),
    (
        "Well done. Somebody, somewhere, is mildly proud.",
        "स्याबास। कोही न कोही, कतै न कतै, अलिअलि गर्व गरिरहेको छ।",
    ),
    (
        "Done. Your chair missed you, though.",
        "भयो। तर कुर्सीले चाहिँ तपाईंलाई सम्झियो।",
    ),
    (
        "Look at you, following instructions. Rare.",
        "वाह, भनेको मान्नुभयो। यस्तो कहिलेकाहीँ मात्र हुन्छ।",
    ),
    (
        "Your spine sends its regards.",
        "तपाईंको ढाडले नमस्कार पठाएको छ।",
    ),
    (
        "There you go. Your eyes say dhanyabad.",
        "ल भयो। आँखाले धन्यवाद भनेका छन्।",
    ),
    (
        "Proud of you. Don't let it go to your head.",
        "गर्व लाग्यो। तर धेरै फुर्ती नलगाउनुहोस्।",
    ),
    (
        "Break complete. Your doctor just lost a customer.",
        "ब्रेक सकियो। तपाईंको डाक्टरले एउटा ग्राहक गुमाए।",
    ),
    (
        "See? Easy. Now don't sit for six hours straight.",
        "देख्नुभयो? सजिलो। अब लगातार छ घण्टा नबस्नुहोस्।",
    ),
    (
        "Well done. You've earned a chiya. Kidding. Water.",
        "स्याबास। एक कप चिया कमाउनुभयो। ठट्टा। पानी।",
    ),
    (
        "Back already? The meeting didn't miss you either.",
        "फर्किनुभयो? मिटिङले पनि तपाईंलाई सम्झेन।",
    ),
    (
        "Add that to your CV under self-care.",
        "यसलाई CV मा सेल्फ-केयर भनेर थप्नुहोस्।",
    ),
    (
        "Healthiest thing you've done since Tihar.",
        "तिहारयता तपाईंले गरेको सबैभन्दा स्वस्थ काम।",
    ),
];

pub const END_OF_DAY: &[Line] = &[
    (
        "The email can wait. It waited all day for you.",
        "इमेल पर्खिन्छ। दिनभरि त तपाईंलाई पर्खियो।",
    ),
    (
        "Go home. The office chair will still be here tomorrow, unfortunately.",
        "घर जानुहोस्। अफिसको कुर्सी भोलि पनि यहीँ हुनेछ, दुर्भाग्यवश।",
    ),
    (
        "Log off before your boss remembers one more thing.",
        "हाकिमलाई अर्को काम सम्झना आउनुअघि लग अफ गर्नुहोस्।",
    ),
    (
        "Nobody ever got promoted for being online till 9.",
        "राति ९ बजेसम्म अनलाइन बसेर कसैको प्रमोसन भएको छैन।",
    ),
    (
        "Time to go. Beat the Koteshwor jam, or at least join it early.",
        "जाने बेला भयो। कोटेश्वरको जाम छल्नुहोस्, नभए कम्तीमा चाँडै भेटिनुहोस्।",
    ),
    (
        "Your shift is over. The work isn't, and that's tomorrow's problem.",
        "तपाईंको पाली सकियो। काम सकिएको छैन, तर त्यो भोलिको समस्या हो।",
    ),
    (
        "Log off. Nobody will read that email tonight, including you.",
        "लग अफ गर्नुहोस्। आज राति त्यो इमेल कसैले पढ्दैन, तपाईंले पनि।",
    ),
    (
        "Time's up. Even Singha Durbar went home hours ago.",
        "समय सकियो। सिंहदरबार त घण्टौं अघि नै घर गइसक्यो।",
    ),
    (
        "Stop working. You're not paid for overtime, emotionally or financially.",
        "काम रोक्नुहोस्। ओभरटाइमको पैसा पाउनुहुन्न, न खल्तीमा न मनमा।",
    ),
    (
        "If it's urgent, they'll call. They always call.",
        "जरुरी भए फोन आउँछ। सधैं आउँछ।",
    ),
    (
        "Close the laptop. Tomorrow-you can handle it; that's what they're for.",
        "ल्यापटप बन्द गर्नुहोस्। भोलिको तपाईंले सम्हाल्नुहुन्छ, त्यसैका लागि त हुनुहुन्छ।",
    ),
];

pub const BREAKFAST: &[Line] = &[
    (
        "Food first, laptop later. House rule.",
        "पहिले खाना, अनि ल्यापटप। घरको नियम।",
    ),
    (
        "Chiya and a biscuit is not breakfast, no matter how you arrange it.",
        "चिया र बिस्कुट जसरी मिलाए पनि बिहानको खाना होइन।",
    ),
    (
        "Your emails were not hungry all night. You were.",
        "रातभरि इमेल भोकाएको थिएन, तपाईं भोकाउनुभयो।",
    ),
    (
        "Eat something. The standup will survive without you for ten minutes.",
        "केही खानुहोस्। स्ट्यान्डअप मिटिङ १० मिनेट तपाईंबिना बाँच्छ।",
    ),
    (
        "Eat. The pigeons at Basantapur had breakfast hours ago.",
        "खानुहोस्। बसन्तपुरका परेवाले त घण्टौं अघि नै खाइसके।",
    ),
    (
        "Have breakfast. Yesterday's cold chiya doesn't count.",
        "बिहानको खाना खानुहोस्। हिजोको सेलाएको चिया गनिँदैन।",
    ),
    (
        "Food, now. Sel roti, chiura, anything. The laptop can wait.",
        "खाना, अहिले। सेलरोटी, चिउरा, जे भए पनि। ल्यापटप पर्खिन्छ।",
    ),
    (
        "Eat breakfast. Your brain runs on glucose, not optimism.",
        "खाना खानुहोस्। दिमाग आशाले होइन, ग्लुकोजले चल्छ।",
    ),
];

pub const LUNCH: &[Line] = &[
    (
        "Dal bhat power, 24 hour. But only if you actually eat it.",
        "दाल भात पावर, २४ आवर। तर खाए मात्र।",
    ),
    (
        "Have you eaten? \"Later\" is not a time.",
        "खाना खानुभयो? 'पछि' भन्ने कुनै समय होइन।",
    ),
    (
        "The canteen is closing the pot. Go.",
        "क्यान्टिनले भाँडो बन्द गर्दैछ। जानुहोस्।",
    ),
    (
        "Eating at your desk is a meeting with your keyboard. Eat elsewhere.",
        "डेस्कमै खानु भनेको किबोर्डसँग मिटिङ हो। अन्तै गएर खानुहोस्।",
    ),
    (
        "Go eat. Nobody in history has regretted the second serving of bhat.",
        "खान जानुहोस्। भात थपेर इतिहासमा कसैले पछुताएको छैन।",
    ),
    (
        "Lunch break. Legally, emotionally and spiritually required.",
        "दिउँसोको खानाको ब्रेक। यो चाहिँ छुटाउनै मिल्दैन।",
    ),
    (
        "Eat something that isn't Wai Wai. Or do; we're not the food police.",
        "वाइवाईबाहेक केही खानुहोस्। वा वाइवाई नै, हामी खानाका प्रहरी होइनौं।",
    ),
    (
        "The khaja ghar is open and the momos won't eat themselves.",
        "खाजाघर खुला छ, मःम आफैं खाइँदैन।",
    ),
];

pub const DINNER: &[Line] = &[
    (
        "Dinner time. The screen can watch itself for a while.",
        "खाना खाने बेला। स्क्रिनले केही बेर आफैंलाई हेरोस्।",
    ),
    (
        "Close the laptop. Dinner is more interesting than your inbox.",
        "ल्यापटप बन्द गर्नुहोस्। इनबक्सभन्दा बेलुकाको खाना रमाइलो छ।",
    ),
    (
        "Eat now, before dinner becomes a midnight Wai Wai.",
        "अहिले खानुहोस्, नत्र बेलुकाको खाना मध्यरातको वाइवाई बन्छ।",
    ),
    (
        "Dinner. Put the phone face down too; we know about the phone.",
        "खाना। फोन पनि घोप्टो पारिदिनुहोस्, फोनको कुरा हामीलाई थाहा छ।",
    ),
    (
        "Eat with people, not with tabs.",
        "ट्याबसँग होइन, मान्छेसँग खानुहोस्।",
    ),
    (
        "The group chat is not dinner conversation. Go to the table.",
        "ग्रुप च्याट खानाको गफ होइन। टेबलमा जानुहोस्।",
    ),
    ("Laptop down, plate up.", "ल्यापटप तल, थाल माथि।"),
    (
        "Go eat. The tarkari has been reheated twice already.",
        "खान जानुहोस्। तरकारी दुईपटक तताइसकियो।",
    ),
];

pub const BEDTIME: &[Line] = &[
    (
        "Laptop off. The internet will still be there tomorrow.",
        "ल्यापटप बन्द। इन्टरनेट भोलि पनि हुन्छ।",
    ),
    (
        "Nothing good has ever been decided on a laptop after 11.",
        "राति ११ पछि ल्यापटपमा कहिल्यै राम्रो निर्णय भएको छैन।",
    ),
    (
        "Go to sleep. The load-shedding generation managed; so can you.",
        "सुत्नुहोस्। लोडसेडिङ पुस्ताले सक्यो, तपाईंले पनि सक्नुहुन्छ।",
    ),
    (
        "Sleep now, or be the one nodding off in the 10 o'clock meeting.",
        "अहिले सुत्नुहोस्, नत्र भोलि १० बजेको मिटिङमा झुक्ने तपाईं नै हुनुहुन्छ।",
    ),
    (
        "Sleep. The next reel is the same as the last hundred.",
        "सुत्नुहोस्। अर्को रिल पनि अघिल्ला सयवटाजस्तै हो।",
    ),
    (
        "Bedtime. Your bed misses you more than your manager does.",
        "सुत्ने बेला। म्यानेजरले भन्दा ओछ्यानले तपाईंलाई बढी सम्झन्छ।",
    ),
    (
        "Go to sleep. Tomorrow's traffic will need all your patience.",
        "सुत्नुहोस्। भोलिको जामले तपाईंको सबै धैर्य माग्छ।",
    ),
    (
        "Lights off. The dogs outside will bark all night anyway; get a head start.",
        "बत्ती निभाउनुहोस्। बाहिरका कुकुर रातभर भुक्छन् नै, चाँडै सुरु गर्नुहोस्।",
    ),
    (
        "Close the laptop before you start another \"quick fix\".",
        "अर्को 'सानो फिक्स' सुरु गर्नुअघि ल्यापटप बन्द गर्नुहोस्।",
    ),
    (
        "Staying up doesn't make tomorrow come any later. Sleep.",
        "जागा बस्दैमा भोलि ढिलो आउँदैन। सुत्नुहोस्।",
    ),
];
