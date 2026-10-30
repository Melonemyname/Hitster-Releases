// Hashes aller Seed-Stände, die vor dem Seed-Manifest ausgeliefert wurden
// (Tags v1.0.0-preview.50 bis v1.0.10, seit es den Songs-Ordner gibt). Damit erkennt
// ensureSeeded in einem Ordner ohne .hitster-seed.json, ob eine Datei bzw. ein
// CSV-Abschnitt noch unverändert aus einer alten Version stammt. Text: SHA-256
// mit LF-Zeilenenden (CSV-Abschnitte wie linesHash), Cover: SHA-256 der Rohdaten.
// Erzeugt aus der Git-Historie, wird nicht mehr erweitert: Neuere Versionen
// schreiben das Manifest und brauchen die Liste nicht.
export const LEGACY_SEED_HASHES = {
  'covers/battle-generations.png': [
    'bfcbbbb05d070a3fbd2d9d78949fea1e13df686458965115ef2c181cdb50b393'
  ],
  'covers/bayern.png': [
    '3959c959508c7a9c915bb961381539e46a387b8855dcd40703981a5c145d779d'
  ],
  'covers/bingo.png': [
    '09849215a67355a3fa9e899bb783406d4f28bb5b3933b3ef35ee481156b373e3'
  ],
  'covers/celebration.png': [
    '700881410fa7a6d28fbdbd7cca41c0bc1862a1f13a19189935ccefd317bdd674'
  ],
  'covers/christmas.png': [
    'd7e1586f9d7a6f32bf155d3e99b3c619484f62b7c9787b71ad1bb920d502288d'
  ],
  'covers/custom.png': [
    '365f509d8d98e0b92523f655da19fd97ebe3d2bfb5d57e5ace85126059e4e4a1'
  ],
  'covers/guilty.png': [
    '4997b69968b0c371e5eb8fbe64df51e033a90074e50007b7ef8b00105a00a0d0'
  ],
  'covers/hiphop.png': [
    'ab38400c2671efcbe515d5adabded5d2f76d8534d75f52a5f31ecb6c7703c1f7'
  ],
  'covers/platinum.png': [
    'ff34fa673d9daaca00aa5aa366066716edc59a6b6f1b4e121225472920c60fbf'
  ],
  'covers/rock.png': [
    '22f54d233084985220668a8a045981abab9aa822a77326e420265a2a24c994f3'
  ],
  'covers/schlager.png': [
    '08cc4ab41e5e52d4cdbd249379d8086e9d56d1360c69c20f85a0dacef3d7b1cf'
  ],
  'covers/soundtrack.png': [
    '1019039af4d23d767603b317de41f8edca093ed4eda9cee6cb05ef61f523a325'
  ],
  'covers/standart.png': [
    'dcecd0f176125ca1a326a0fb838122c14543c23d0247a15ecb8aba996e13b62b'
  ],
  'covers/summer.png': [
    '19a871be3c721487e1543578026691ce81ae9013971f4b53dc0fde0430284e65'
  ],
  'covers/wacken.png': [
    '17b273ef9aa5b8fd8022a0d97f46ff736de91036d205e73e642161a597c4f1a5'
  ],
  'csv:Battle of the Generations (1985-2004)': [
    '5f21bc086c411561ebcb0023db414291d7ac8524bbc7843beb978496d85000b9',
    'fa2eb5c974cbf992c67b922e91df19a4dd316d6965272a21f8170e14c24c6848'
  ],
  'csv:Battle of the Generations (2005-2025)': [
    '7683ce01b41ea16289a2fd30ca5fea97dab997c52ff6c09d8dec68dda5570af1',
    '9bef2fdb186e482a67f68ec273b822eb44be0a53f873d93785b6fc68132eb042'
  ],
  'csv:Battle of the Generations (bis 1984)': [
    'cbfb6356fed04c91f86c641b0c21cf84127a0e36683f28bf962856ee06edc0ba',
    '857b45727fa72c6effdfc15e7577e18893de670cc2f5cd0dc81136b4492e788c'
  ],
  'csv:Bayern1 Expansion': [
    '13b49f0466a68a803f41e21b10c3bf6f3c17f660f900b84050a41248bb816042',
    'd7062fb581a6c2829052dc739b27b5494e32ed00aac50da27c5b7c6b254803d0',
    '51bee82df8dbd1b28bd3a1c6e91b5b59c4316120350f1b6116bce65527865937'
  ],
  'csv:Bingo Deutschland': [
    'dfa1bb97136550ac74ba6596e5806581bd085d37d45ae1524037ead7f84c9d3c',
    '94403fd7cb16f16b1c0f73e129bc32487c56dd662967797f5c8fde5330468a7d',
    '0a864d2ede4ef6e33eeadc0ed72a1e925e18a51c4e0b87ba4f334680bdb87d7a'
  ],
  'csv:Deutsch': [
    'ad306aa753f92c1ad1ecd02a40b3e7f4d1468319040d1fbb171212bb300d4eae',
    '9b67ee706a6f93a1b7e6a2de3fe20e9124bbf8e8544f1b8ea4d7ae9815ac52ef',
    '92411d3d69e0017c17bcb7cede7e0c4a468b3cb0a228a665b348eba7077b770a'
  ],
  'csv:Deutschland Celebration': [
    '37dfdc90c6a9ce65a17b1000931ebc04e1d5ee145d09516b44ca9dcf9c0d28af',
    '070118f558c5d9076461156ac2846bbb8e4fe07f0af9acc7a084f1512fb10a50',
    '1fc4c433fde3ce70390452d4e6fa3d36ddb7b697bf1730ae79c22021b0ffb526'
  ],
  'csv:Deutschland Christmas Expansion': [
    '3f2c1218540ab190490c9e891cb109f1ee61e1861608956f8ff8eca3b20d1d42',
    '03d87a79f0a57f601022b45ce28f4700bfe5e22b4f9aeb74aac4b5a0e0782115',
    '3652160360f89eeebab28a875c17385e28f04c4bea582d0968e341fb9553b94e'
  ],
  'csv:Deutschland Guilty Pleasures': [
    'd0c12d2a759f92847880b853fad16aaedeb80aaeab9c4c98e8956b1a6bd8b8f7',
    '89e424d6fa52a496764a641f676db49bb6805c9857f2ab7f06c7495425f6a921',
    '7a14bcb77f7fd683ebb7993815f462c8fe360f84108b81826e6a900dfbbc92f3'
  ],
  'csv:Deutschland Rock': [
    'efe2ebd3e832fd49d80008630c1c75b9c8196a1d85f6d1763c7bdac2a180a636',
    '35e71fee19247dd8124a310cd34d897df612991283391bcfaf258b2a59184aa9',
    '096be1dab65e01c431267d199fc11c15fc4090eb1e250e498fc1b224271a7e78'
  ],
  'csv:Deutschland Soundtracks Expansion': [
    'c2fc1c69e77ea81987276d14c26e71007eeefe9f136dad2d6cfd62ae0f7e5838',
    'fbd4d2c5145176671b9f9df3cee6743ef8ef83d708dcb92ecff571939d009337',
    '3b7a02da1cf81bf1b99d4456c1c38286ff2a82dd7752c709511d6c681d0f9d99'
  ],
  'csv:Deutschland Summer Party': [
    '4d2f231006b412bda9e776fa044304daaa9bd01b412d77ba25461c933f4f66ae',
    '2ca9887bb000e216f6acb9c643f752da33f49fb0228ebd7f6eb31c5c06377c78',
    'a456e2834d43824f2b36aa088e98d73791e70b86fa38df45891f9e88ac0fd2dd'
  ],
  'csv:Deutschland Urban & Hip-Hop': [
    'a1b833742152c8351c38fa579b0753f2179c8fad030ed278df8dd1f3a1edbd70',
    '82512944b7329abdbb7a9e3469cfdea88545aa0a55eae7ea4b418540a8e46b1c'
  ],
  'csv:Español Rock': [
    'd5bbe8bda8068c80d12974c5ad62eb514591baed0f243bfdae5b2c09e94ea373',
    '01e754682b3bfb5207bef8b5da82a010d8e5ed78c69eee29b0e1c8b59e11bb71'
  ],
  'csv:Hungary Rock': [
    'ac850c85ad58a7c48b0976d97e414c6719885ecf33b3776381086ad95445b9f7',
    'd23c46a9db79d95e5c60f8add8532057ffdbd09e2712b75d613764ec08cd2fd8'
  ],
  'csv:Nederlands Rock': [
    '9c02ba5b2f32baff54b7984b54293d374cea9ecb4e554fe9a60fcb93fb4779c0',
    '06ea328968ad7d835df535ef510cfbe23a6d643fc7f12eb69f4c16ec0425fa69'
  ],
  'csv:Nordics Rock': [
    '0e1d427dfe893ea504be16f27033a7d0f274648a27c980707a18ba69fc2bd87c',
    'f03d7d7d0fa037c257542b8e0e860735001039ffe1d3dccbda84fca9ae537a3c',
    'b12549a23a3f7226c2a80b4381e790cf6675d4083957cf5a25fc8a06cce9a766'
  ],
  'csv:Platinum Edition': [
    '818c9f7fb1018d415dba4ff62ddd85e446310c0ca9ec50dad0d4aa96c8ab7ce1',
    '6074659735c7d976fa772c988326483275c7406d4ec5dfc2e6b42bac90616de6',
    'f31e99edf0a7c2b3e46aa970bf8992c50f4c14d679d3094011ad20cd17219b20'
  ],
  'csv:Polonia Rock': [
    'e06f0a3c534ec3d5092e67e910ea109214e41841f486027d939a7e8336266f32',
    '4250cb9c157027d4e1446607ed765820405901c5299eb3e65d67e85e7e837310'
  ],
  'csv:Schlager Party': [
    '77792cab8cd650d088ed6325dec1cbc46f3aab61ca946125148f0bd9d9af19eb',
    '1a06c103fe1435246d8bb88ba3e5e28293fd1f5f60e72ee9f233edf8f4b69fbc',
    '7ab0f3a7be469423f618d44f9207b5ff09ffcc0e8116d5485e119d3d3b5fe7c2'
  ],
  'csv:Wacken On Air': [
    'e5983b77fd949e962b93f2e54bff76bd42e906524d780388fbd1ce3307bfc357'
  ],
  'csv:header': [
    '1eb29aa9b48b339f714f73037dd46169acbf2b5ec20a9033d7abd3f9e7801412'
  ],
  'editions.json': [
    '04ef819fa593f3cb1c1e4e5acb5875bfe021bea1593d5cc43b54cae47cff7e83',
    '5bcfdc7e2d5c39a8847891f4bef3df955ef70d945b903441da05d227dd1421a3',
    'fcff4f0d57af735cc94a429268e7bf8c322f889f0b4fd617e5d9cb1926382ba2'
  ],
  'hitster-battle-generations-1985-2004.txt': [
    'd28cfe5e2ea362e2fa117ed254b1b06b589510817e84d69be925ac6c65834e91',
    'cee409ddefde637a57718602cde69f66904f898ba49e2b9bb2ae735a1a1b4444'
  ],
  'hitster-battle-generations-2005-2025.txt': [
    'd6e39801af151773db069ea220a62606ba863486f6f8391b4a800126a3029b93',
    '788276c06f48bfe872db4eb1aa630589a380610644e72ea73b3444364db7faf3'
  ],
  'hitster-battle-generations-bis-1984.txt': [
    'dd9806de0e5701105bf7157c88b3ecd0af84446301b0c9f99e2ce1f75d0f572a',
    '4a33c63eb8e0e58b2c1fa4e0ca09d27a56c1ef8b9e42ac0e21c3c54fa001e137'
  ],
  'hitster-bayern1-expansion.txt': [
    'b59a0080482f3d280844e7a10b2049c3e236d350554e94cf2af7abf9764fed25'
  ],
  'hitster-bingo-deutschland.txt': [
    '4ced9cb5e09cfb5b71ff370e4aa83ce7db4d4064e68b96737ed85ddd5c7eee66'
  ],
  'hitster-deutsch.txt': [
    '41457457c1a624855ca06a0abd8fa7aef57083f1965cd9dcfc2ae8ee567faec9'
  ],
  'hitster-deutschland-celebration.txt': [
    '08f137a60efbadcc4974fbae1c351d0111e779ac514659ec4b76b2432542f7af'
  ],
  'hitster-deutschland-christmas-expansion.txt': [
    'f1beadbc31a5a61b022829fb793072975d1330cc5507392f337097205d7e7ba7'
  ],
  'hitster-deutschland-guilty-pleasures.txt': [
    'f0d3a7e5a64879bf2e67628e16f9205c55979174e0784ecc9f58a0a2b6b8f2cf'
  ],
  'hitster-deutschland-hip-hop.txt': [
    'a9908a0b33c53fc23c1d5a9fbb30f4e1994c686a526373d3b7652e0ade7e5883'
  ],
  'hitster-deutschland-rock.txt': [
    '8b55f6ca42fef58e5e69a8149a8e3d8152e6cdb9b588f40fda0b933a6cd8d578'
  ],
  'hitster-deutschland-soundtracks-expansion.txt': [
    'd6184c79378814253440ca7cb85e8e3a3f8fd82c9b905419260a289005d33a6b'
  ],
  'hitster-deutschland-summer-party.txt': [
    '4c1b1798e09665201f0a8fa3f11b0b5a68b6ddf6d9f8f3fcb47c5c4a25d301bf'
  ],
  'hitster-espanol-rock.txt': [
    'cea8af5c7ed3609780085545d829461f88085208397c312ff997635aeb2ccb5b'
  ],
  'hitster-hungary-rock.txt': [
    '79a41d2757f82efda5ec2d54a35c5a36d3b78c9bc6af5726d453d52a176cb100'
  ],
  'hitster-nederlands-rock.txt': [
    '27c5770ba9a76feaeedef701cd7d6ed463beb495f2c2b1995b024652841ceaba'
  ],
  'hitster-nordics-rock.txt': [
    '5abc5bd5f457020d08192a964436b9562651e7181a31c9287aba9483ebd14145'
  ],
  'hitster-platinum-edition.txt': [
    '2ce7a1da84a8cad2a910c3ad5009641d0d7c2fa76c7deafc0218340965eb4d0e'
  ],
  'hitster-polonia-rock.txt': [
    '4c83736f6573b06c2a689b6373b01140cc7d6bceb610f26762b091d9285f92cf'
  ],
  'hitster-schlager-party.txt': [
    '0785e4bfab0ca2c5b9a52362cffe5979d81fe96ff52fc958dfa70db998334628'
  ],
  'hitster-wacken-on-air.txt': [
    '5db638a1f565c8345b7b4540f286210a60f4e840c1bd726c7d9942acbfcc7de2'
  ]
}
