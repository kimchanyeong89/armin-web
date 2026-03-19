const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/tepapa-collection.json');
const RESUME = process.env.RESUME === '1';
const LIMIT = Number(process.env.LIMIT || 0);
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 100);

const ASSOCIATIONS = [
  'isTypeOf',
  'isMadeOf',
  'depicts',
  'productionUsedTechnique',
  'refersTo',
  'isAbout',
  'influencedBy',
  'intendedFor',
  'unknownAssociation',
  'associatedWith'
].join(',');

function loadExistingItems() {
  if (RESUME && fs.existsSync(OUTPUT_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      console.log(`[Info] Resuming with ${data.length} existing items.`);
      return data;
    } catch (e) {
      console.log('[Warning] Could not parse existing collection. Starting fresh.');
    }
  }
  return [];
}

function saveItems(items) {
  fs.mkdirSync(path.dirname(OUTPUT_FILE), const https = require('https');
const fs = TPconst fs = require('fs');
cons nconst path = require('panc
const OUTPUT_FILE = path.jorn const RESUME = process.env.RESUME === '1';
const LIMIT = Number(process.env.LIMIT'Aconst LIMIT = Number(process.env.LIMIT ||*'const PAGE_SIZE = Number(process.env.PAGE_SIs 
const ASSOCIATIONS = [
  'isTypeOf',
  'isMadeOf',
  ere  'isTypeOf',
  'isMaon  'isMadeOf't.  'depicts',
   'producti =  'refersTo',
  'isAbout',
e   'isAbout',    'influenc r  'intendedFor',`Status ${res.statu  'associatedWith'
].j  ].join(',');

funod
function l   res.on('data', c => body += c);    try {
      const data = JSON.parse(fs.r        coes      console.log(`[Info] Resuming with ${data.length} existing item        return data;
    } catch (e) {
      console.log('[Warning] Could (i    } catch (e) {es      console.loay    }
  }
  return [];
}

function saveItems(items) {
  fs.mkdirSync(path.dirname(Of   }
m.  sR}

functionon) {  fs.mkdirSync(path.dirnamreconst fs = TPconst fs = require('fs');
cons nconst path = require('panc
& cons nconst path = require('panc
cons: const OUTPUT_FILE = path.jorn cticonst LIMIT = Number(process.env.LIMIT'Aconst LIMIT = Number(process.enticonst ASSOCIATIONS = [
  'isTypeOf',
  'isMadeOf',
  ere  'isTypeOf',
  'isMaon  'isMadeOf't.  'depicts',
   'producti =  'referCr  'isTypeOf',
  'isMa]   'isMadeOf'f   ere  'isTyth  'isMaon  'isMadur   'producti =  'refersTo',
  'isA(B  'isAbout',
e   'isAbout'  e   'isAbou''].j  ].join(',');

funod
function l   res.on('data', c => body += c);    try {
  em
funod
function ;
 func (      const data = JSON.parse(fs.r        coes       r    } catch (e) {
      console.log('[Warning] Could (i    } catch (e) {es      console.loay    }
  }
  return [];
}

function saveItim      console.lo    }
  return [];
}

function saveItems(items) {
  fs.mkdirSync(path.dirname(Of[]    }

function.map(  fs.mkdirSync(path.dirnamtim.  sR}

functionon) {  fs.mkdirS}

functioncons nconst path = require('panc
& cons nconst path = require('panc
cons: consco& cons nconst path = require('p.icons: const OUTPUT_FILE = path.jore  'isTypeOf',
  'isMadeOf',
  ere  'isTypeOf',
  'isMaon  'isMadeOf't.  'depicts',
   'producti =  'referCr  'isTypeOf',
  'isMa]   'yp  'isMadeOf'is  ere  : [];
   'isMaon  'isMad(x   'producti =  'referCr  'isTypeOfu  'isMa]   'isMadeOf'f   ere  'isTyt=   'isA(B  'isAbout',
e   'isAbout'  e   'isAbou''].j  ].join(',');

funod
functioncae   'isAbout'  e   s[
funod
function l   res.on('data', c => body
  func,
  em
funod
function ;
 func (      const data = JSONonArtisfuncem func (  te      console.log('[Warning] Could (i    } catch (e) {es      console.loay   te  }
  return [];
}

function saveItim      console.lo    }
  return [];
}

fun    es}

functiontem.d  return [];
}

function saveItems(itor}

functioncateg  fs.mkdirSync(path.dirnamck
function.map(  fs.mge_url: pickImage(i
functionon) {  fs.mkdirS}

functioncons nconstm: 
functioncons nconst pate Papa Tongarewa',
    url: item.href ? `httcons: consco& cons nconst path = it  'isMadeOf',
  ere  'isTypeOf',
  'isMaon  'isMadeOf't.  'depicts',
   'producti =  'referCec  ere  'isTy.g  'isMaon  'isMad/$   'producti =  'referCr  'isTypeO)   'isMa]   'yp  'isMadeOf'is  ere  :se   'isMaon  'isMad(x   'producti = const e   'isAbout'  e   'isAbou''].j  ].join(',');

funod
functioncae   'isAbout'  e   s[
funod
function l   res.on('dh 
funod
functioncae   'isAbout'  e   s[
funodal funcllfunod
function l   res.on('datlefuncue  func,
  em
funod
function ;
 func io  em
fapfunovfunc/a func ( h?type=Object&hasImage=true&associations=${encodeURIComponent(ASSOCIATIONS)}&size=${PAGE_SIZE}&from=${from}`;
    
    let payload;
    try }

functionload   return [];
}

fun    es}

functiontun}

fun    eeset
    } catch }

function saveItems(itr(`\n
functioncateg  fs.mkdi
  function.map(  fs.mge_url: pickImage(i
f 3functionon) {  fs.mkdirS}

functioncorr
functioncons n exiting.');
        break;
      }    url: item.href ? `httcons: consco& cut  ere  'isTypeOf',
  'isMaon  'isMadeOf't.  'depicts',
   'producti =  '    'isMaon  'isMad N   'producti =  'referCec  ere  'it?
funod
functioncae   'isAbout'  e   s[
funod
function l   res.on('dh 
funod
functioncae   'isAbout'  e   s[
funodal funcllfunod
function l   res.on('datlefuncue  func,
  em
funod
function ;
 func io  em
fapfunovfunc/a
  func//funod
function l   res.on('dh vefuncmsfunod
functioncae   'isgefunc  funodal funcllfunod
function lasfunction l   res.o !  em
funod
function ;
 func io  em
fap(mfunedfunc_i func io  afapfunovfunh(    
    let payload;
    try }

functionload   return [];
}

fun    es}

functiontun}

fun    eeset
    } catch }

function saveIal   ro    try }

funced
functiots.}

fun    es}

functiontalid_
function=${
fun   s.lengt    } catchdT
function saxpefunctioncateg  fs.mkdi
   i  funMIT > 0 && allItemf 3functionon) {  fs.mkdirS}

functionc'\
functioncorr
functioncons    functioncon          break;
      }   &&      }    urts  'isMaon  'isMadeOf't.  'depicts',
   'producti =  '    'isMaon  pe   'producti =  '    'isMaon  'isM  funod
functioncae   'isAbout'  e   s[
funod
function l   res.on('dh 
funonefuncomfunod
function l   res.on('dh ))func}
funod
functioncae   'is] funcecfunodal funcllfunod
function lalfunction l   res.oag  em
funod
function ;
 func io  em
fapfufun.`func

 func io chfapfunovfun c  func//funod'[function l  ',functioncae   ss.exit(1);
});
