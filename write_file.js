const fs = require('fs');
const content = `import React, { useMemo, useState, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";

const ExhibitionModal = React.lazy(() => import("../components/ExhibitionModal"));

type ExhibitionPageProps = {
  exhibitions: Exhibition[];
};

type ExhibitionWithType = ExhibitionItem & { type: "PERMANENT" | "TEMPORARY" };

export default function ExhibitionPage({ exhibitions }: ExhibitionPageProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const museum = exhibitions.find((e) => e.id === id);

  const [activeItem, setActiveItem] = useState<ExhibitionWithType | null>(null);

  const allExhibitions = useMemo<ExhibitionWithType[]>(() => {
    if (!museum) return [];
    return [
      ...(museum.permanentExhibitions || []).map((e) => ({ ...e, type: "PERMANENT" as const })),
      ...(museum.temporaryExhibitions || []).map((const fs = require('fs');
conRYconst content = `import },import { useParams, useNavigate } from "react-router-dom";
import type { Exm import type { Exhibition, ExhibitionItem } from "../types w
const ExhibitionModal = React.lazy(() => import("../components/Exhib   
type ExhibitionPageProps = {
  exhibitions: Exhibition[];
};

type ExhibitionWitSan  exhibitions: Exhibition[]se};

type ExhibitionWithTypeden"
 
export default function ExhibitionPage({ exhibitions }: ExhibitionPageProps) 1C1  const { id } = useParams();
  const navigate = useNavigate();
  const museukg  const navigate = useNaviga    const museum = exhibitions.finiz
  const [activeItem, setActiveItem] = useState<Exhib-sp
  const allExhibitions = useMemo<ExhibitionWithType[]>(() => {
    if (!museum       if (!museum) return [];
    return [
      ...(museum.perle    return [
      ...(musce      ...(m        ...(museum.temporaryExhibitions || []).map((constbtn:hover {
          background: #1C1C1C;conRYconst content = `import },import { useParams, useNavigate } from "reaerimport type { Exm import type { Exhibition, ExhibitionItem } from "../types w
const Exhi1pconst ExhibitionModal = React.lazy(() => import("../components/Exhib   
type 1type ExhibitionPageProps = {
  exhibitions: Exhibition[];
};

type Exhid  exhibitions: Exhibition[]#F};

type ExhibitionWitSan  in
er;
type ExhibitionWithTypeden"
 
export default funct    
export default function       const navigate = useNavigate();
  const museukg  const navigate = useNaviga    const museum = exhibitions.-t  const museukg  const navigate d:  const [activeItem, setActiveItem] = useState<Exhib-sp
  const allExhibitionser  const allExhibitions = useMemo<ExhibitionWithType[]>-t    if (!museum       if (!museum) return [];
    return [
        return [
      ...(museum.perle    retur68      ...(m        ...(musce      ...(m       iv          background: #1C1C1C;conRYconst content = `import },import { useParams, useNavigate leconst Exhi1pconst ExhibitionModal = React.lazy(() => import("../components/Exhib   
type 1type ExhibitionPageProps = {
  exhibitions: Exhibition[];
};

type Exhid  exhibitions: Exhibsttype 1type ExhibitionPageProps = {
  exhibitions: Exhibition[];
};

type Exhid  ex <  exhibitions: Exhibition[];
};

: };

type Exhid  exhibitions  
   
type ExhibitionWitSan  in
er;
type ExhiClier;
type ExhibitionWithTawtygM 
export default funct    ttonexport default function    const museukg  const navigate = useNaviga    const museum on  const allExhibitionser  const allExhibitions = useMemo<ExhibitionWithType[]>-t    if (!museum       if (!museum) return [];
    return [
        return [
      ..rg    return [
        return [
      ...(museum.perle    retur68      ...(m        ...(musce      ...(m       iv      seum.name}</h1>
            ...(museusttype 1type ExhibitionPageProps = {
  exhibitions: Exhibition[];
};

type Exhid  exhibitions: Exhibsttype 1type ExhibitionPageProps = {
  exhibitions: Exhibition[];
};

type Exhid  ex <  exhibitions: Exhibition[];
};

: };

type Exhid  exhibitions  
   
type     exhibitions: Exhibition[];
};

 4};

type Exhid  exhibitionst:
1.6  exhibitions: Exhibition[];
};

type Exhid  ex <  exhibitions: E.d};

type Exhid  ex <  exhib <
div};

: };

type Exhid  exhibitions  
   
t    
  <
tyade   
type ExhibitionWitSa={tyfler;
type ExhiClier;
type}>
   type Exhibitiostexport default funct    ttgr    return [
        return [
      ..rg    return [
        return [
      ...(museum.perle    retur68      ...(m        ...(musce      ...(m       iv      seum.name}</h1>
            ...(museusttype 1type ExhibitionPageProps = {
  exhibi()        ctive      ..rg    r          return [
   le=      ...(museu b            ...(museusttype 1type ExhibitionPageProps = {
  exhibitions: Exhibition[];
};

type Exhid f  exhibitions: Exhibition[];
};

type Exhid  exhibitions  };

type Exhid  exhibitionsim
ge}  exhibitions: Exhibition[];
};

type Exhid  ex <  exhibitions: E '};

type Exhid  ex <  exhib  
   };

: };

type Exhid  exhibitions  
   
typ      
ty      
type     exhibitions </div};

 4};

type Exhid  exhibitionstpaddin
ty24 1.6  exhibitions: Exhibi<d};

type Exhid  ex <  exhibitilo
k',
type Exhid  ex <  exhib <
div};

:diudiv};

: };

type Exhid px
: }ont
tye:    
t    
  <
tyade   
tginBot  <
 16, ctype Ex#6type ExhiClier;
type}>
   ty  type}>
   type     ty          return [
      ..rg    return [
        return [
  '      ..rg    re"        return [
    fo      ...(museugi            ...(museusttype 1type ExhibitionPageProps = {
  exhibi()        ctive      ..rg    r         exhibi()        ctive      ..rg    r          return [on   le=      ...(museu b            ...(museusttype 1/div>  exhibitions: Exhibition[];
};

type Exhid f  exhibitions: Exhibition[];
};

t</};

type Exhid f  exhibitio={{ fl};

type Exhid  exhibitions  };

type E  
/di
type Exhid  exhibitionsim: (ge}  exhibitions: Exhibiei};

type Exhid  ex <  exhibiti f
exD
type Exhid  ex <  exhib  
   };

:ead   };

: };

type Exhid px
: }x 3
ty' }   
typ      
ty      
t">ty  ty       <type   le
 4};

type Exhid  exhibiti2, 
tyginBottom: 32 }}>
              <b
type Exhid  ex <  exhibitilo
k'Clik',
type Exhid  ex <  exhibngtyp=div};

:diudiv};

: };

to
:di   
: };

t  <
tyton: }ont
tye: outye: -bt    
 li  <
()ty> tginBotve 16, ctyp)}type}>
   ty  type}>
   type      ty     type             ..rg    return [
                  return [
  ' tF  '      ..rg  Ol    fo      ...(museugi            ze  exhibi()        ctive      ..rg    r         exhibi()        ctive      ..rg eH};

type Exhid f  exhibitions: Exhibition[];
};

t</};

type Exhid f  exhibitio={{ fl};

type Exhid  exhibitions  };

type E  
/di
type Exhid  exhibitionsim: (ge}  exhibitions: Exhibiei}; GLOBA};

t</};

type Exhid f  exhibitio={{ f      
typiv>
type Exhid  exhibitions  };

  <
type E  
/di
type Exhid  lay/di
typ',tyin
type Exhid  ex <  exhibiti f
exD
type Exhid  ex <  exhaddexD
type Exhid  ex <  exhib'ftyx'   };

:ead   };

: };

',
:ea: 2
: };

assN
ty="v: }x 3
-line">ty' }  typ      ty        t">ty     4};

type Exhid  exhibite:
ty, ftyginBottom: 32 }}>
 : '              <b
ttttype Exhid  ex m<k'Clik',
type Exhid  ex <  totype ExNa
:diudiv};

: };

to
:di   
: };
etA
: };

tm(n
to)} :ty: };
 width: tyt0%tye: outyeCo li  <
()ty> tginB',()ty>in   ty  type}>
   type      ty       type     IT                  return [
  ' tF  '      ..rg </butto  ' tF  '      ..rg  Ol    
type Exhid f  exhibitions: Exhibition[];
};

t</};

type Exhid f  exhibitio={{ fl};

type Exhid  exhibitions  };

type E  
/di
type Exhid  exum.};

t</};

type Exhid f  exhibitio={{ f  
   
typ   
type Exhid  exhibitions  };

   
type E  
/di
type Exhid  , p/di
typ: 'rel
t</};

type Exhid f  exhibitio={{ f      
typiv>
type Exhid  eing
typ, ctypiv>
type Exhid  exhibitions  }n.type iv
  <
type E  
/di
type ExhitityMo/di
typ  ty           exhibitiontype ExhItexD
type Exhid  ex <  exhadmNtye=type Exhid  ex <  exhib'ft  
:ead   };

: };

',
:ea: 2
: };
nul
: };

'   
',   :  : };
in
astruty=  -line">ty'  
type Exhid  exhibite:
ty, ftyginBottom: 32 }   ty, ftyginBottom: 32   : '              <b
tt  ttttype Exhid  ex mivtype Exhid  ex <  totype Ex}`:diudiv};

: };

to
:di   
:s/
: };

tonP
to.ts:',: };
enetA
