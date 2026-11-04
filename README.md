# ADİAK Bilet: kollokvium simulyatoru

**Canlı:** https://adiak-bilet.vercel.app

"Azərbaycan dilində işgüzar və akademik kommunikasiya" fənnindən kollokviuma hazırlıq üçün sayt.

## Necə işləyir
1. **Bilet çək.** 10 bilet arasından birini seçirsən, 30 sualdan 3-ü düşür (default: 1–10, 11–20 və 21–30 bölmələrinin hər birindən bir sual).
2. **Hazırlıq.** Saniyəölçən işləyir (ayarlarda 0–10 dəqiqə).
3. **Cavab.** Hər suala ayrıca, səslə danışırsan (MediaRecorder). İstəsən, yazılı da cavab verə bilərsən.
4. **Qiymət.** Səs WAV-a çevrilir və `/api/grade` serverinə (Vercel funksiyası) göndərilir. Server prompt-u və etalon cavabı özü qurur, sonra Gemini-yə göndərir. Gemini səsi mətnə çevirir və cavabı etalonla müqayisə edir. Hər sual 0–10 keyfiyyət balı alır və kollokviumun 10 balında hər sualın payı 1/3-dir. **Kollokvium balı = 3 sualın ortalaması (10 bal üzərindən).** Bundan əlavə göstərilir:
   - dediyin və çatışmayan fikirlər;
   - qısa rəy və nitq mədəniyyəti haqqında qeyd.
5. **Profil və tarixçə.** İlk girişdə ad soruşulur, nəticələr hər profil üçün ayrıca saxlanır. Beləliklə, eyni telefondan bir neçə nəfər istifadə etsə də, nəticələr qarışmır. Məlumat yalnız həmin brauzerdə qalır (localStorage), serverə yazılmır.
6. **API açarı.**
   - Hər istifadəçi öz pulsuz Gemini açarını daxil edir. Saytda addım-addım təlimat və AI Studio düyməsi var.
   - Açar yalnız brauzerdə saxlanır və `x-user-key` başlığı ilə yalnız bizim serverə göndərilir.
   - Vercel-də `GEMINI_API_KEY` mühit dəyişəni qoyulsa, açarı olmayanlar ümumi açardan istifadə edir.
   
   Səs tezliyi elə seçilir ki, fayl Vercel-in 4.5 MB limitinə sığsın. Buna görə maksimum danışma vaxtı 4 dəqiqədir. "Zəif suallara üstünlük" rejimi aşağı bal aldığın və hələ cavab vermədiyin sualları daha tez-tez çıxarır.

Brauzerin öz nitq tanıma sistemi (Web Speech API) istifadə edilmir, çünki iPhone Safari Azərbaycan dilini tanımır. Səs birbaşa Gemini-yə göndərilir.

## Fayllar
- `index.html`, `style.css`, `app.js`: saytın özü (build lazım deyil).
- `api/grade.js`: Vercel funksiyası (Gemini ilə qiymətləndirmə).
- `questions.js` və `api/_data.js`: 30 sual və etalon cavablar. **Repo-da yoxdur**, çünki cavablar dərs vəsaitinə əsaslanır. Əvəzinə nümunə fayllar var: `questions.example.js` və `api/_data.example.js` (30 rəsmi sual, etalon cavab yerində nümunə mətn).
- `build_questions.py`: sual docx-ini və cavab `.md` faylını oxuyub yuxarıdakı iki faylı yaradır.

## Özün işə salmaq
1. Nümunə faylları köçür:
   ```
   cp questions.example.js questions.js
   cp api/_data.example.js api/_data.js
   ```
   Sonra hər sual üçün etalon cavabı öz dərs materialına görə yaz (və ya `build_questions.py`-ı öz faylların üçün uyğunlaşdır).
2. Yerli yoxlama: `python -m http.server 8000`. Qiymətləndirmə üçün `/api/grade` lazımdır, ona görə `npx vercel dev` işlət.
3. Yerləşdirmə: `npx vercel --prod`. Mikrofon yalnız HTTPS-də işləyir, Vercel ünvanı bunu təmin edir.
