import type { ReleaseDetail } from '../api'

/** Sample records for the demo. Fake IDs: the demo never talks to Discogs. */
const rel = (
  id: number,
  artist: string,
  title: string,
  year: number,
  country: string,
  label: string,
  catno: string,
  format: string,
  genres: string[],
  styles: string[],
  sides: string[][],
): ReleaseDetail => ({
  id,
  masterId: null,
  title,
  artist,
  year,
  country,
  label,
  catno,
  barcode: null,
  format,
  genres,
  styles,
  tracklist: sides.flatMap((tracks, s) =>
    tracks.map((t, i) => ({ position: `${String.fromCharCode(65 + s)}${i + 1}`, title: t, duration: '' })),
  ),
  notes: null,
  hasCover: 1,
})

export const CATALOG: ReleaseDetail[] = [
  rel(1001, 'Miles Davis', 'Kind of Blue', 1959, 'US', 'Columbia', 'CL 1355', 'Vinyl, LP, Album, Mono', ['Jazz'], ['Modal'], [
    ['So What', 'Freddie Freeloader', 'Blue In Green'],
    ['All Blues', 'Flamenco Sketches'],
  ]),
  rel(1002, 'John Coltrane', 'A Love Supreme', 1965, 'US', 'Impulse!', 'A-77', 'Vinyl, LP, Album, Stereo', ['Jazz'], ['Free Jazz', 'Hard Bop'], [
    ['Part I: Acknowledgement', 'Part II: Resolution'],
    ['Part III: Pursuance', 'Part IV: Psalm'],
  ]),
  rel(1003, 'Herbie Hancock', 'Head Hunters', 1973, 'US', 'Columbia', 'KC 32731', 'Vinyl, LP, Album', ['Jazz', 'Funk / Soul'], ['Jazz-Funk'], [
    ['Chameleon', 'Watermelon Man'],
    ['Sly', 'Vein Melter'],
  ]),
  rel(1004, 'Radiohead', 'OK Computer', 1997, 'UK', 'Parlophone', 'NODATA 02', 'Vinyl, LP, Album (2×)', ['Rock', 'Electronic'], ['Alternative Rock', 'Art Rock'], [
    ['Airbag', 'Paranoid Android'],
    ['Subterranean Homesick Alien', 'Exit Music (For A Film)', 'Let Down'],
    ['Karma Police', 'Fitter Happier', 'Electioneering'],
    ['Climbing Up The Walls', 'No Surprises', 'Lucky', 'The Tourist'],
  ]),
  rel(1005, 'Björk', 'Homogenic', 1997, 'UK', 'One Little Indian', 'TPLP 71', 'Vinyl, LP, Album', ['Electronic', 'Pop'], ['Art Pop', 'Trip Hop'], [
    ['Hunter', 'Jóga', 'Unravel', 'Bachelorette', 'All Neon Like'],
    ['5 Years', 'Immature', 'Alarm Call', 'Pluto', 'All Is Full Of Love'],
  ]),
  rel(1006, 'Nirvana', 'Nevermind', 1991, 'US', 'DGC', 'DGC-24425', 'Vinyl, LP, Album', ['Rock'], ['Grunge', 'Alternative Rock'], [
    ['Smells Like Teen Spirit', 'In Bloom', 'Come As You Are', 'Breed', 'Lithium', 'Polly'],
    ['Territorial Pissings', 'Drain You', 'Lounge Act', 'Stay Away', 'On A Plain', 'Something In The Way'],
  ]),
  rel(1007, 'Massive Attack', 'Blue Lines', 1991, 'UK', 'Wild Bunch', 'WBRLP 1', 'Vinyl, LP, Album', ['Electronic', 'Hip Hop'], ['Trip Hop'], [
    ['Safe From Harm', 'One Love', 'Blue Lines', "Be Thankful For What You've Got"],
    ['Five Man Army', 'Unfinished Sympathy', 'Daydreaming', 'Lately', 'Hymn Of The Big Wheel'],
  ]),
  rel(1008, 'Portishead', 'Dummy', 1994, 'UK', 'Go! Beat', '828 553-1', 'Vinyl, LP, Album', ['Electronic'], ['Trip Hop'], [
    ['Mysterons', 'Sour Times', 'Strangers', 'It Could Be Sweet', 'Wandering Star'],
    ["It's A Fire", 'Numb', 'Roads', 'Pedestal', 'Biscuit', 'Glory Box'],
  ]),
  rel(1009, 'Pink Floyd', 'The Dark Side Of The Moon', 1973, 'UK', 'Harvest', 'SHVL 804', 'Vinyl, LP, Album, Stereo', ['Rock'], ['Prog Rock', 'Psychedelic Rock'], [
    ['Speak To Me', 'Breathe', 'On The Run', 'Time', 'The Great Gig In The Sky'],
    ['Money', 'Us And Them', 'Any Colour You Like', 'Brain Damage', 'Eclipse'],
  ]),
  rel(1010, 'Fleetwood Mac', 'Rumours', 1977, 'US', 'Warner Bros. Records', 'BSK 3010', 'Vinyl, LP, Album', ['Rock', 'Pop'], ['Soft Rock'], [
    ['Second Hand News', 'Dreams', 'Never Going Back Again', "Don't Stop", 'Go Your Own Way', 'Songbird'],
    ['The Chain', 'You Make Loving Fun', "I Don't Want To Know", 'Oh Daddy', 'Gold Dust Woman'],
  ]),
  rel(1011, 'Joni Mitchell', 'Blue', 1971, 'US', 'Reprise Records', 'MS 2038', 'Vinyl, LP, Album', ['Folk, World, & Country', 'Rock'], ['Folk Rock', 'Singer/Songwriter'], [
    ['All I Want', 'My Old Man', 'Little Green', 'Carey', 'Blue'],
    ['California', 'This Flight Tonight', 'River', 'A Case Of You', 'The Last Time I Saw Richard'],
  ]),
  rel(1012, 'Talking Heads', 'Remain In Light', 1980, 'US', 'Sire', 'SRK 6095', 'Vinyl, LP, Album', ['Rock', 'Funk / Soul'], ['New Wave', 'Afrobeat'], [
    ['Born Under Punches (The Heat Goes On)', 'Crosseyed And Painless', 'The Great Curve'],
    ['Once In A Lifetime', 'Houses In Motion', 'Seen And Not Seen', 'Listening Wind', 'The Overload'],
  ]),
  rel(1013, 'David Bowie', 'The Rise And Fall Of Ziggy Stardust And The Spiders From Mars', 1972, 'UK', 'RCA Victor', 'SF 8287', 'Vinyl, LP, Album', ['Rock'], ['Glam'], [
    ['Five Years', 'Soul Love', 'Moonage Daydream', 'Starman', "It Ain't Easy"],
    ['Lady Stardust', 'Star', 'Hang On To Yourself', 'Ziggy Stardust', 'Suffragette City', "Rock 'N' Roll Suicide"],
  ]),
  // Wishlist
  rel(1014, 'Marvin Gaye', "What's Going On", 1971, 'US', 'Tamla', 'TS 310', 'Vinyl, LP, Album', ['Funk / Soul'], ['Soul'], [
    ["What's Going On", "What's Happening Brother", "Flyin' High (In The Friendly Sky)", 'Save The Children', 'God Is Love', 'Mercy Mercy Me (The Ecology)'],
    ['Right On', 'Wholy Holy', "Inner City Blues (Make Me Wanna Holler)"],
  ]),
  rel(1015, 'Prince And The Revolution', 'Purple Rain', 1984, 'US', 'Warner Bros. Records', '25110-1', 'Vinyl, LP, Album', ['Funk / Soul', 'Rock', 'Pop'], ['Pop Rock'], [
    ["Let's Go Crazy", 'Take Me With U', 'The Beautiful Ones', 'Computer Blue', 'Darling Nikki'],
    ['When Doves Cry', 'I Would Die 4 U', "Baby I'm A Star", 'Purple Rain'],
  ]),
  rel(1016, 'The Velvet Underground & Nico', 'The Velvet Underground & Nico', 1967, 'US', 'Verve Records', 'V-5008', 'Vinyl, LP, Album, Mono', ['Rock'], ['Art Rock', 'Experimental'], [
    ['Sunday Morning', "I'm Waiting For The Man", 'Femme Fatale', 'Venus In Furs', 'Run Run Run', "All Tomorrow's Parties"],
    ['Heroin', 'There She Goes Again', "I'll Be Your Mirror", "The Black Angel's Death Song", 'European Son'],
  ]),
  // Only findable through search
  rel(1017, 'Led Zeppelin', 'Untitled (IV)', 1971, 'US', 'Atlantic', 'SD 7208', 'Vinyl, LP, Album', ['Rock'], ['Hard Rock', 'Folk Rock'], [
    ['Black Dog', 'Rock And Roll', 'The Battle Of Evermore', 'Stairway To Heaven'],
    ['Misty Mountain Hop', 'Four Sticks', 'Going To California', "When The Levee Breaks"],
  ]),
]

export const RELEASES = new Map(CATALOG.map((r) => [r.id, r]))

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 19).replace('T', ' ')

export interface StoredCopy {
  id: number
  releaseId: number
  mediaCondition: string | null
  sleeveCondition: string | null
  notes: string | null
  addedAt: string
  forSale: boolean
  askingPrice: number | null
  priceCurrency: string | null
  coOwnerId?: number | null
}

export interface DemoState {
  nextId: number
  signedIn: boolean
  me: { name: string; email: string; currency: string; shareCollection?: boolean; shareWishlist?: boolean; shareActivity?: boolean }
  copies: StoredCopy[]
  wishlist: Array<{ id: number; releaseId: number; notes: string | null; addedAt: string }>
  groups: Array<{ id: number; name: string }>
  groupCopies: Array<{ groupId: number; copyId: number }>
  shares: Array<{ token: string; kind: 'all' | 'group' | 'wishlist' | 'forsale'; groupId: number | null }>
  /** Records added by hand (negative IDs), with their cover as a data: URL. Optional: older saved demos lack it. */
  manual?: Array<{ release: ReleaseDetail; cover: string | null }>
  users: Array<{ id: number; email: string; name: string; role: 'admin' | 'user'; currency: string; disabled: number; createdAt: string }>
}

export function seedState(): DemoState {
  const copy = (id: number, releaseId: number, media: string, sleeve: string, age: number, sale?: number): StoredCopy => ({
    id,
    releaseId,
    mediaCondition: media,
    sleeveCondition: sleeve,
    notes: null,
    addedAt: daysAgo(age),
    forSale: sale !== undefined,
    askingPrice: sale ?? null,
    priceCurrency: sale !== undefined ? 'USD' : null,
  })
  return {
    nextId: 100,
    signedIn: true,
    me: { name: 'Demo User', email: 'demo@example.com', currency: 'USD' },
    copies: [
      copy(1, 1001, 'NM', 'VG+', 90),
      copy(2, 1001, 'VG', 'VG', 40, 25),
      copy(3, 1002, 'NM', 'NM', 85),
      copy(4, 1003, 'VG+', 'VG+', 70),
      copy(5, 1004, 'NM', 'NM', 60),
      copy(6, 1005, 'NM', 'VG+', 55),
      copy(7, 1006, 'VG+', 'VG', 50, 30),
      copy(8, 1007, 'VG+', 'VG+', 30),
      copy(9, 1008, 'NM', 'NM', 20),
      copy(10, 1009, 'VG+', 'VG', 15, 22),
      copy(11, 1010, 'VG', 'VG', 10),
      copy(12, 1011, 'NM', 'VG+', 6),
      copy(13, 1012, 'VG+', 'VG+', 3),
      copy(14, 1013, 'VG', 'G+', 1),
    ],
    wishlist: [
      { id: 1, releaseId: 1014, notes: null, addedAt: daysAgo(12) },
      { id: 2, releaseId: 1015, notes: null, addedAt: daysAgo(8) },
      { id: 3, releaseId: 1016, notes: null, addedAt: daysAgo(2) },
    ],
    groups: [
      { id: 1, name: '90s' },
      { id: 2, name: 'Jazz' },
    ],
    groupCopies: [
      ...[1, 2, 3, 4].map((copyId) => ({ groupId: 2, copyId })),
      ...[5, 6, 7, 8, 9].map((copyId) => ({ groupId: 1, copyId })),
    ],
    shares: [],
    users: [
      { id: 1, email: 'demo@example.com', name: 'Demo User', role: 'admin', currency: 'USD', disabled: 0, createdAt: daysAgo(120) },
      { id: 2, email: 'sam@example.com', name: 'Sam', role: 'user', currency: 'EUR', disabled: 0, createdAt: daysAgo(30) },
    ],
  }
}
