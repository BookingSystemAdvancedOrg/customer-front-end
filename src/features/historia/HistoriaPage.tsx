import founders from '../../assets/anar/founders.png'

const CORREN_ARTICLE =
  'https://www.corren.se/nyheter/linkoping/artikel/unga-paret-oppnar-nytt-i-klassiska-linkopingslokalen/lw49dzwr'

/**
 * Vår historia (Figma-förlaga: anars historia-sida, github.com/AryaEisa/anar).
 * Rent innehåll utan backend-data - ersätter den tidigare Om oss-sidan, som
 * bara visade hårdkodad platsdata (nu på Kontakt/i footern via live
 * public-info i stället).
 */
export default function HistoriaPage() {
  return (
    <>
      <section className="photo-hero">
        <p className="hero-kicker">Om oss</p>
        <h1>Vår historia</h1>
        <p className="hero-sub">
          En berättelse om två människor, en dröm och en frukt som blev namnet
          på vår restaurang.
        </p>
      </section>

      <section className="glass-panel">
        <h2>Anar – granatäpple</h2>
        <p>
          Anar betyder granatäpple på persiska. Frukten står för oss som en
          symbol för färg, generositet och det som är gott att dela – precis
          som måltider runt ett bord.
        </p>
        <p>
          Vår inspiration kommer från den fantastiska frukten anar, eller
          granatäpple som vi säger här i Sverige.
        </p>
      </section>

      <section className="glass-panel">
        <h2>Vår vision</h2>
        <p>
          Vi kommer ursprungligen från Iran, och vår vision är att ge Sverige
          en genuin upplevelse av vårt älskade hemland – genom smaker,
          kryddor och gästfrihet som känns äkta och varm.
        </p>
      </section>

      <section className="glass-panel">
        <h2>Från dröm till dörrarna på Djurgårdsgatan</h2>
        <p>
          Bakom Anar står Mustafa Molaiy och Shima Mahdawy, som träffades i
          Finspång och länge sparat och planerat för att en dag få öppna en
          egen restaurang. Efter år av förberedelser – och utbildning i att
          driva restaurang i Sverige – blev visionen verklighet i en klassisk
          Linköpingslokal vid Djurgårdsgatan och Lasarettsgatan, där det
          tidigare legat en välkänd pizzeria. Lokalen har rustats upp och
          fått nytt liv som Anar.
        </p>
        <p>
          I köket och på golvet möts inspiration från Iran och Afghanistan:
          ris och saffran, kött och kyckling, bönor och örter – rätter som vi
          vill att ni ska känna skillnad på, både i smak och i hur de
          serveras.
        </p>
        <p>
          Mustafa och Shima beskriver själva hur det känns att gå från
          anställda till egna företagare: större ansvar, mer hjärta i varje
          dag, och en längtan efter att gästerna ska trivas och vilja komma
          tillbaka.
        </p>
      </section>

      <blockquote className="glass-quote" cite={CORREN_ARTICLE}>
        <p>
          &ldquo;Att driva en egen restaurang har varit min dröm hela livet.
          Jag älskar mat och ägnar mig åt matlagning flera timmar om
          dagen.&rdquo;
        </p>
        <footer>– Shima Mahdawy, i intervju med Corren</footer>
      </blockquote>

      <section className="glass-panel">
        <h2>I media</h2>
        <figure className="glass-figure">
          <div className="glass-figure-frame">
            <img
              src={founders}
              alt="Mustafa Molaiy och Shima Mahdawy vid restaurangentrén, som i Correns reportage inför öppning"
              width={960}
              height={640}
              loading="lazy"
            />
          </div>
          <figcaption>
            Mustafa &amp; Shima vid lokalen i samband med{' '}
            <a
              className="glass-link"
              href={CORREN_ARTICLE}
              target="_blank"
              rel="noopener noreferrer"
            >
              Correns artikel
            </a>{' '}
            inför öppning. Foto: Dennis Petersson / Östgöta Correspondenten
          </figcaption>
        </figure>
        <p>
          När vi öppnade skrev Östgöta Correspondenten om satsningen och
          lokalen – om drömmen, huset vid Trädgårdsföreningen och vägen hit.
        </p>
        <p>
          <a
            className="glass-link"
            href={CORREN_ARTICLE}
            target="_blank"
            rel="noopener noreferrer"
          >
            Läs artikeln: &quot;Öppnar persisk restaurang i klassiska
            lokalen&quot; (Corren)
          </a>
        </p>
      </section>
    </>
  )
}
