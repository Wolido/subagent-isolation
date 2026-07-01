# Signs of AI Writing

Source: https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing

This is a list of writing and formatting conventions typical of AI chatbots such as ChatGPT, with real examples taken from Wikipedia articles, drafts, comments, and other content. It is a field guide to help detect undisclosed AI-generated content *on Wikipedia*: while some of the signs may be broadly applicable, some may not apply in a non-Wikipedia context.

Not all text featuring these indicators is AI-generated, as the large language models that power AI chatbots are trained on human writing, including Wikipedia. Many elements of AI writing can be found in editorials, blogs, or fan fiction.

Moreover, this list is *descriptive*, not *prescriptive*; it consists of observations, not rules. The patterns here are only potential *signs* of a problem, not *the problem itself*.

---

## Content Patterns

### C1. Undue emphasis on significance, legacy, and broader trends

LLM writing often puffs up the importance of the subject matter by adding statements about how arbitrary aspects of the topic represent or contribute to a broader topic. There is a distinct and easily identifiable repertoire of ways that it writes these statements.

**Words to watch:** *stands/serves as*, *is a testament/reminder*, *a vital/significant/crucial/pivotal/key role/moment*, *underscores/highlights its importance/significance*, *reflects broader*, *symbolizing its ongoing/enduring/lasting*, *contributing to the*, *setting the stage for*, *marking/shaping the*, *represents/marks a shift*, *key turning point*, *evolving landscape*, *focal point*, *indelible mark*, *deeply rooted*

> The Statistical Institute of Catalonia was officially established in 1989, **marking a pivotal moment** in the evolution of regional statistics in Spain.
>
> The founding of Idescat **represented a significant shift** toward regional statistical independence, enabling Catalonia to develop a statistical system tailored to its unique socio-economic context. This initiative **was part of a broader movement** across Spain to decentralize administrative functions and enhance regional governance.

LLMs may include these statements for even the most mundane of subjects like etymology or population data. Sometimes, they add hedging preambles acknowledging that the subject is relatively unimportant or low-profile, before talking about its importance anyway.

> During the Spanish colonial period, the name *Bakunutan* was hispanized to *Bacnotan*. **This etymology highlights the enduring legacy** of the community's resistance and **the transformative power** of unity in shaping its identity.

When talking about biology, LLMs tend to over-emphasize connections to the broader ecosystem or environment, even when those connections are tenuous or generic.

> Currently, **there is no specific conservation assessment** for *Lethrinops lethrinus* by the IUCN. However, the general health of the Lake Malawi ecosystem is **crucial for the survival of this and other endemic species**.

### C2. Undue emphasis on notability, attribution, and media coverage

Similarly, LLMs act as if the best way to prove that a subject is notable is to hit readers over the head with claims of notability, often by listing sources that a subject has been covered in. They may or may not provide additional context as to what those sources have actually said about the subject, and often inaccurately attribute their own superficial analyses to the source.

**Words to watch:** *independent coverage*, *local/regional/national/[country name] media outlets*, *music/business/tech outlets*, *profiled in*, *written by a leading expert*, *active social media presence*

> She spoke about AI on CNN, and was **featured in** Vogue, Wired, Toronto Star, and **other media**.
>
> Her insights have also been **featured in** *Wired*, *Refinery29*, and **other prominent media outlets**.

In articles about people/entities who use social media, LLMs will often note that they "maintain an active social media presence" or something similar. This wording is particularly idiosyncratic to AI text.

> The mall **maintains a strong digital presence**, particularly on Instagram, where it actively shares the latest updates and events.

### C3. Superficial analyses

AI chatbots tend to insert superficial analysis of information, often in relation to its significance, recognition, or impact. This is often done by attaching a present participle ("-ing") phrase at the end of sentences, sometimes with vague attributions to third parties.

**Words to watch:** *highlighting/underscoring/emphasizing ...*, *ensuring ...*, *reflecting/symbolizing ...*, *contributing to ...*, *cultivating/fostering ...*, *encompassing ...*, *valuable insights*, *align/resonate with*

> As of the April 2008 census, the population of Douera stood at approximately 56,998 inhabitants, **creating a lively community within its borders.** Situated in the central-north region of the country, Douera enjoys close proximity to the capital city, Algiers, **further enhancing its significance as a dynamic hub of activity and culture.**

> It holds a pivotal place in the East Central Railway Zone of Indian Railways, **serving as a major railway hub with historical significance.** [...] Historically, it has been crucial for linking Darbhanga with significant cities like Delhi, Patna, and Kolkata, **facilitating the movement of passengers and goods.**

### C4. Promotional and advertisement-like language

LLMs have serious problems keeping a neutral tone. Even when prompted to use an encyclopedic tone, their output will often tend toward advertisement-like writing, or like the prose of a travel guide.

**Words to watch:** *boasts a*, *vibrant*, *rich*, *profound*, *enhancing*, *showcasing*, *exemplifies*, *commitment to*, *natural beauty*, *nestled*, *in the heart of*, *groundbreaking*, *renowned*, *featuring*, *diverse array*

> **Nestled** within the **breathtaking** region of Gonder in Ethiopia, Alamata Raya Kobo **stands as a vibrant town with a rich cultural heritage and a significant place** within the Amhara region. **From its scenic landscapes to its historical landmarks**, Alamata Raya Kobo **offers visitors a fascinating glimpse into the diverse tapestry** of Ethiopia.

When writing about people or companies, LLMs will often adopt a press-release or commercial-esque tone.

> These projects **align with KQ's goals of reducing its environmental footprint, improving operational efficiency, and fostering community development through job creation.** CEO Allan Kilavuka **emphasized the airline's commitment to sustainability, customer focus, and Africa's prosperity through responsible corporate practices.**

### C5. Vague attributions and overgeneralization of opinions

AI chatbots tend to attribute opinions or claims to some vague authority—a practice called weasel wording.

**Words to watch:** *Industry reports*, *Observers have cited*, *Experts argue*, *Some critics argue*, *several sources/publications* (when only few sources are cited), *such as* (before exhaustive word lists)

> Due to its unique characteristics, the Haolai River is of interest to **researchers and conservationists**.

> The Kwararafa (Kororofa) confederacy is **described in scholarship** as a shifting Benue valley coalition led by Jukun groups...

AI chatbots also commonly exaggerate the quantity of sources that these opinions are attributed to. They may present views from one or two sources as widely held, or imply that lists of examples are non-exhaustive when the sources give no indication that other examples exist.

### C6. Outline-like conclusions about challenges and future prospects

Many LLM-generated Wikipedia articles include a "Challenges" section, which typically begins with a sentence like "Despite its [positive words], [subject] faces challenges..." and ends with either a vaguely positive assessment, or speculation about how ongoing or potential initiatives could benefit the subject.

**Words to watch:** *Despite its... faces several challenges...*, *Despite these challenges*, *Challenges and Legacy*, *Future Outlook*

> As the global economy continues to evolve, international economic law **faces new challenges and opportunities.** [...] The future of international economic law lies in its ability to **adapt to these emerging trends** and continue to facilitate a stable and equitable global economic order.

> **Despite its industrial and residential prosperity, Korattur faces challenges** typical of urban areas, including [...] With its **strategic location and ongoing initiatives**, Korattur **continues to thrive** as an integral part of the Ambattur industrial zone.

### C7. Leads treating lists or broad titles as proper nouns

In AI-generated articles about topics with a title that is not a proper name, such as a list, the first sentence of the lead may introduce or define the article's title as if it were a standalone real-world entity.

> **Catchment area (health) refers to** the geographic area from which a health facility, such as a hospital or clinic, draws its patients.

> **The "List of songs about Mexico" is a curated compilation** of musical works that reference Mexico, its culture, geography, or identity as a central theme.

---

## Language and Grammar Patterns

### L1. High density of "AI vocabulary" words

Many studies have demonstrated that LLMs overuse specific words. These words started appearing far more frequently in text produced after 2022. They often co-occur in LLM output: where there is one, there are likely others.

**Words to watch:** *Additionally* (especially beginning a sentence), *align with*, *boasts* (meaning "has"), *bolstered*, *crucial*, *delve*, *emphasizing*, *enduring*, *enhance*, *fostering*, *garner*, *highlight* (as a verb), *interplay*, *intricate/intricacies*, *key* (as an adjective), *landscape* (as an abstract noun), *meticulous/meticulously*, *pivotal*, *robust*, *showcase*, *tapestry* (as an abstract noun), *testament*, *underscore* (as a verb), *valuable*, *vibrant*

> Somali cuisine is an **intricate** and diverse fusion of a multitude of culinary influences, drawing from the rich **tapestry** of Arab, Indian, and Italian flavours. This culinary **tapestry** is a direct result of Somalia's longstanding heritage of **vibrant** trade and bustling commerce.
>
> **Additionally,** a distinctive feature of Somali culinary tradition is the incorporation of camel meat and milk. They are considered a delicacy and serve as cherished and fundamental elements in the rich **tapestry** of Somali cuisine.
>
> An **enduring testament** to the influence of Italian colonial rule in Somalia is the widespread adoption of pasta and lasagne in the local culinary **landscape**, especially in the south, **showcasing** how these dishes have integrated into the traditional diet alongside rice.

When prompted to respond to the placement of an AI-generated tag on an article, AI chatbots tend to use the word "concrete" as an adjective.

> In the absence of **concrete** evidence, I propose removing the AI-generated tag immediately to maintain the article's integrity.

### L2. Avoidance of basic copulatives ("is"/"are" phrases)

LLM-generated text often substitutes simpler constructions that use copulas such as *is* or *are* for constructions like *serves as a* or *mark the*. One study documented an over 10% decrease in the usage of the words *is* and *are* in academic writing in 2023.

**Words to watch:** *serves as/stands as/marks/represents [a]*, *boasts/features/maintains/offers [a]*

| Before | After (AI copyedit) |
|---|---|
| Gallery 825 on La Cienega Boulevard, which was purchased in 1958, is LAAA's exhibition arm for contemporary art. There are four individual gallery spaces... | Gallery 825 on La Cienega Boulevard **serves as** LAAA's exhibition space for contemporary art. The gallery **features** four separate spaces... |

### L3. Negative parallelisms

When LLMs describe a subject, their output may seem as though it is clearing up a common misconception. This kind of contrast can come across as trying to retroactively challenge such thinking.

#### Not just X, but also Y

> **Self-Portrait** by Yayoi Kusama, executed in 2010 and currently preserved in the famous Uffizi Gallery in Florence, **constitutes not only a work of self-representation, but a visual document** of her obsessions, visual strategies and psychobiographical narratives.

#### Not X, but Y

> This dispersal **is not dissolution. Rather, it constitutes** what Deleuze might describe as "becoming"—an identity in flux, constituted through iterative difference. Through this lens, Kusama's self-portrait **is not a mirror but a portal**: **not a representation of self, but a mechanism** for its constant reinvention.

### L4. Rule of three

LLMs overuse the "rule of three". This can take different forms, from "adjective, adjective, adjective" to "short phrase, short phrase, and short phrase". LLMs often use this structure to make superficial analyses appear more comprehensive.

> The Amaze Conference brings together **global SEO professionals, marketing experts, and growth hackers** to discuss the latest trends in digital marketing. The event features **keynote sessions, panel discussions, and networking opportunities**.

### L5. Elegant variation

Generative AI has a repetition-penalty code, meant to discourage it from reusing words too often. For instance, the output might give a main character's name and then repeatedly use a different synonym or related term (e.g., protagonist, key player, eponymous character) when mentioning it again.

---

## Style Patterns

### S1. Title case in headings

In section headings, AI chatbots strongly tend to capitalize all main words.

> **Global Context: Critical Mineral Demand**
>
> **Strategic Negotiations and Global Partnerships**
>
> **High-Stakes Deals: Glencore, China, and Russia**

### S2. Overuse of boldface

AI chatbots may display various phrases in boldface for emphasis in an excessive, mechanical manner, often in a "key takeaways" fashion.

> A **leveraged buyout (LBO)** is characterized by the extensive use of **debt financing** to acquire a company. This financing structure enables **private equity firms** and **financial sponsors** to control businesses while investing a relatively small portion of their own equity. The acquired company's **assets and future cash flows** serve as collateral for the debt...

### S3. Inline-header vertical lists

AI chatbots output often includes vertical lists where the list marker is followed by an inline boldfaced header, separated with a colon from the remaining descriptive text. Instead of proper wikitext, a bullet point may appear as a bullet character (•), hyphen (-), en dash (–), hash (#), or emoji.

> 1. Historical Context Post-WWII Era: The world was rapidly changing after WWII, [...]
> 2. Nuclear Arms Race: Following the U.S. atomic bombings, the Soviet Union detonated its first bomb in 1949, [...]
> 3. Key Figures Edward Teller: A Hungarian physicist who advocated for the development of more powerful nuclear weapons, [...]

### S4. Overuse of em dashes

While human editors often use em dashes (—), LLM output uses them more often than nonprofessional human-written text of the same genre, and uses them in places where humans are more likely to use commas, parentheses, or colons. LLMs especially tend to use em dashes in a formulaic, pat way.

> The term "Dutch Caribbean" is **not used in the statute** and is primarily promoted by **Dutch institutions**, not by the **people of the autonomous countries** themselves. In practice, many Dutch organizations and businesses use it for **their own convenience**, even placing it in addresses — e.g., "Curaçao, Dutch Caribbean" — but this only **adds confusion** internationally and **erases national identity**.

### S5. Curly quotation marks and apostrophes

ChatGPT and DeepSeek typically use curly quotation marks ("..." or '...') instead of straight quotation marks. They also tend to use the curly apostrophe (’), the same character as the curly right single quotation mark, instead of the straight apostrophe (').

> "When 'Not Guilty' Is a Life Sentence"

Note: Curly quotes alone do not prove LLM use. Microsoft Word, macOS, iOS, and many grammar tools automatically convert straight quotes to curly quotes. Gemini and Claude models typically do not use curly quotes.

---

## Communication Patterns

### CM1. Collaborative communication tone

Editors sometimes paste text from an AI chatbot that was meant as correspondence, prewriting or advice, rather than article content.

**Words to watch:** *I hope this helps*, *Of course!*, *Certainly!*, *You're absolutely right!*, *Would you like...*, *is there anything else*, *let me know*, *more detailed breakdown*, *here is a*

> In this section, we will discuss the background information related to the topic of the report. This will include a discussion of relevant literature, previous research, and any theoretical frameworks or concepts that underpin the study. The purpose is to provide a comprehensive understanding of the subject matter...

> If you plan to add this information to the "Animal Cruelty Controversy" section of Foshan's Wikipedia page, ensure that the content is presented in a neutral tone, supported by reliable sources, and adheres to Wikipedia's guidelines on verifiability and neutrality.

### CM2. Knowledge-cutoff disclaimers and speculation about gaps in sources

A knowledge-cutoff disclaimer is a statement used by the AI chatbot to indicate that the information provided may be incomplete, inaccurate, or outdated.

**Words to watch:** *as of [date]*, *Up to my last training update*, *as of my last knowledge update*, *While specific details are limited/scarce...*, *not widely available/documented/disclosed*, *...in the provided/available sources/search results...*, *based on available information*

> **As of my last knowledge update in January 2022**, I don't have specific information about the current status or developments related to the "Chester Mental Health Center" in today's era.

> Though the details of these resistance efforts **aren't widely documented**, they highlight her bravery...

> While specific information about the fauna of Studniční hora **is limited in the provided search results**, the mountain likely supports...

### CM3. Phrasal templates and placeholder text

AI chatbots may generate responses with fill-in-the-blank phrasal templates for the LLM user to replace with words and phrases pertaining to their use case. However, some LLM users forget to fill in those blanks.

> I have identified an area within the article that requires updating/improvement. **[Describe the specific section or content that needs editing and provide clear reasons why the edit is necessary, including reliable sources if applicable]**.

> We remain committed to creating content that aligns with Wikipedia's mission and are open to further guidance. Please find our revised article **[link to the revised article]** and a detailed list of sources **[link to source list]**.

Large language models may also insert placeholder dates like "2025-xx-xx" into citation fields, particularly the access-date parameter.

---

## Filler and Hedging

### F1. Filler Phrases

AI writing often uses wordy filler phrases that can be replaced with a single word.

| Filler Phrase | Concise Alternative |
|---|---|
| In order to | To |
| Due to the fact that | Because |
| At this point in time | Now |
| For the purpose of | For |
| In the event that | If |
| In spite of the fact that | Although |
| With regard to | About |
| It is important to note that | (omit) |

### F2. Excessive Hedging

LLMs tend to pile on multiple layers of qualification, making statements sound tentative and evasive.

| Excessive Hedging | More Direct |
|---|---|
| It could potentially possibly be argued that | The policy may affect |
| It might be suggested that there is a possibility | The evidence suggests |
| One could perhaps consider the idea that | Consider |

### F3. Generic Positive Conclusions

AI-generated text often ends sections or articles with bland, optimistic summaries that lack substance.

| Generic Positive Conclusion | Specific Rewrite |
|---|---|
| The future looks bright | The company plans to open two more locations |
| This is a testament to the enduring power of | (omit or specify actual impact) |
| Overall, the situation remains promising | (provide concrete next steps or data) |

---

## Markup and Formatting Patterns

### M1. Use of Markdown instead of wikitext

A lot of AI chatbots are not proficient in wikitext, the markup language used by Wikipedia. When told to "generate an article", chatbots often default to using Markdown. This formatting is preserved in clipboard text by the copy functions on some chatbot platforms.

Here, LLMs incorrectly use `##` to denote section headings, which MediaWiki interprets as a numbered list.

> ## Geography
> Villers-Chief is situated in the Jura Mountains, in the eastern part of the Doubs department. [...]
> ## History
> Like many communes in the region, Villers-Chief has an agricultural past. [...]
> ## Administration

### M2. Broken wikitext

Since AI chatbots are typically not proficient in wikitext and templates, they often produce faulty syntax.

### M3. Reference markup bugs

Due to a bug, ChatGPT may add code in the form of `:contentReference[oaicite:0]{index=0}` or `oai_citation` in place of links to references in output text.

ChatGPT may also include `turn0search0` (surrounded by Unicode points in the Private Use Area) at the ends of sentences, with the number after "search" increasing as the text progresses.

### M4. Non-existent categories and templates

LLMs may hallucinate non-existent categories, sometimes for generic concepts that *seem like* plausible category titles. They may also hallucinate non-existent templates (especially plausible-sounding types of infoboxes) and template parameters.

---

## Ineffective Indicators

False accusations of AI use can drive away new editors and foster an atmosphere of suspicion. Here are several commonly used indicators that are ineffective in LLM detection—and may even indicate the opposite:

- **Perfect grammar**: While modern LLMs are known for high grammatical proficiency, many editors are also skilled writers or come from professional writing backgrounds.
- **Combination of casual and formal registers**: This may indicate the casual writing of a person in a technical field, or may simply be the result of multiple editors adding to a page.
- **"Bland" or "robotic" prose**: LLM output has specific traits, and it skews positive and verbose by default. These tendencies are formulaic but may not scan as "robotic."
- **"Fancy", "academic", or "formal" prose**: While LLMs disproportionately favor certain words, the correlation does not extend to all formal prose.
- **Letter-like writing**: Although many talk page messages written with salutations, valedictions, and subject lines after 2023 tend to appear AI-generated, letters and emails have conventionally been written in such ways long before modern LLMs existed.
- **Transition words**: Only a few transition words are known to be overused by AI, and this pattern also has precedence in essay-like writing by humans.
- **Unsourced content**: More than 570,000 Wikipedia articles are tagged as needing citations, and most of them predate LLMs. Meanwhile, since modern LLM chatbots can search the web, citations are fairly common now in AI-generated text.
- **Correct wikitext**: Getting the formatting correct, even for complex templates, is normal for experienced editors.

---

## Historical Indicators

The following indicators were common in text generated by older AI models, but are much less frequent in newer models.

### H1. Didactic disclaimers (2022–2024)

Older LLMs often added disclaimers about topics being "important to note".

**Words to watch:** *it's important/critical/crucial to note/remember/consider*, *worth noting*, *may vary*

> The emergence of these informal groups reflects a growing recognition of the interconnected nature of urban issues... **However, it's important to note** that these caucuses operate outside the formal ANC structure and their influence on policy decisions **may vary**.

### H2. Section summaries

When generating longer outputs, older LLMs often added sections titled "Conclusion" or similar, and often ended paragraphs or sections by summarizing and restating its core idea.

**Words to watch:** *In summary*, *In conclusion*, *Overall*

> **In summary**, the educational and training trajectory for nurse scientists typically involves a progression from a master's degree in nursing to a Doctor of Philosophy in Nursing, followed by postdoctoral training in nursing research.

### H3. Prompt refusal

In the past, AI chatbots occasionally declined to answer prompts as written, usually with apologies and reminders that they are AI language models.

**Words to watch:** *as an AI language model*, *as a large language model*, *I cannot offer medical advice, but I can...*, *I'm sorry*

> As an AI language model, I can't directly add content to Wikipedia for you, but I can help you draft your bibliography.

### H4. Abrupt cut-offs

AI tools used to abruptly stop generating content if an excessive number of tokens had been used for a single response. This method is not foolproof, as a malformed copy/paste from one's local computer can also cause this.
