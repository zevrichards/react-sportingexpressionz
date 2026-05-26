import { useEffect, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import { collection, getDocs } from 'firebase/firestore';
import { db, FONT_MAP, DEFAULT_FONT } from '../config/firebase';
import './JerseyPreview.css';

/**
 * Props
 *   league, team, cut, sleeve, variant  — used to fetch images when not passed directly
 *   rootCol         — Firestore root collection (default 'Leagues')
 *   imgFront        — direct URL (skips Firestore fetch when provided)
 *   imgBack         — direct URL (skips Firestore fetch when provided)
 *   playerName      — text to display on back
 *   playerNumber    — number to display on back
 *   fontColor       — CSS colour; overrides FONT_MAP fallback
 *   namePosition    — 'top' | 'bottom'; overrides FONT_MAP fallback
 */
export default function JerseyPreview({
  league, team, cut, sleeve, variant,
  rootCol = 'Leagues',
  imgFront: imgFrontProp = '',
  imgBack:  imgBackProp  = '',
  playerName   = '',
  playerNumber = '',
  fontColor:    fontColorProp    = null,
  namePosition: namePositionProp = null,
}) {
  const [images, setImages] = useState({ front: imgFrontProp, back: imgBackProp });

  // Derive font config — Firestore props take priority, then FONT_MAP, then DEFAULT_FONT
  const fontConfig     = FONT_MAP[team] ?? DEFAULT_FONT;
  const fontFamily     = fontConfig.fontFamily;
  const fontColor      = fontColorProp    || fontConfig.color        || 'white';
  const namePosition   = namePositionProp || fontConfig.namePosition || 'top';

  // Sync when props change (e.g. parent already loaded the images)
  useEffect(() => {
    if (imgFrontProp || imgBackProp) {
      setImages({ front: imgFrontProp, back: imgBackProp });
    }
  }, [imgFrontProp, imgBackProp]);

  // Fetch from Firestore only when no direct image props
  useEffect(() => {
    if (imgFrontProp || imgBackProp) return; // already have images
    if (!league || !team || !cut || !sleeve || !variant) return;

    async function fetchImages() {
      try {
        const variantsRef = collection(
          db, rootCol, league, 'Teams', team,
          'Cuts', cut, 'Sleeves', sleeve, 'Variants'
        );
        const snap = await getDocs(variantsRef);
        for (const d of snap.docs) {
          if (d.data().Variant === variant) {
            setImages({
              front: d.data().JerseyImgFront || '',
              back:  d.data().JerseyImgBack  || '',
            });
            break;
          }
        }
      } catch (e) {
        console.error('JerseyPreview fetch error', e);
      }
    }
    fetchImages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, team, cut, sleeve, variant, rootCol]);

  const showOverlay = playerName || playerNumber;

  return (
    <div className="jersey-preview-wrapper">
      <Swiper
        modules={[Navigation, Pagination]}
        navigation
        pagination={{ clickable: true }}
        spaceBetween={0}
        slidesPerView={1}
        className="jersey-swiper"
      >
        {/* ── Back slide – name + number overlay ── */}
        <SwiperSlide>
          <div className="slide-inner">
            {images.back ? (
              <img src={images.back} alt={`${team} back`} className="preview-img" />
            ) : (
              <div className="preview-placeholder"><span>Back</span></div>
            )}

            {/* Player name — top (standard) or bottom (Bundesliga) */}
            {playerName && (
              <span
                aria-hidden="true"
                className={`jersey-name jersey-name--${namePosition}`}
                style={{ fontFamily, color: fontColor }}
              >
                {playerName}
              </span>
            )}

            {/* Squad number — always centred */}
            {playerNumber && (
              <span
                aria-hidden="true"
                className="jersey-number"
                style={{ fontFamily, color: fontColor }}
              >
                {playerNumber}
              </span>
            )}
          </div>
        </SwiperSlide>

        {/* ── Front slide ── */}
        <SwiperSlide>
          <div className="slide-inner">
            {images.front ? (
              <img src={images.front} alt={`${team} front`} className="preview-img" />
            ) : (
              <div className="preview-placeholder"><span>Front</span></div>
            )}
          </div>
        </SwiperSlide>
      </Swiper>
    </div>
  );
}
