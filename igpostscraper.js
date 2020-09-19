const puppeteer = require('puppeteer');
const { initParams } = require('request');
var write2File = require('../routes/testWrte').write2file;
var mediaCode = "CCyu_trgOiJ";//req.body.mediaCode;
var csJson = new Object();
var postsAccumulator = [];
csJson["account_infotimelines"] = [];
csJson["account_comments"] = [];
var totalComments;
var ownerInfo;

async function startBrowser() {
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox'],
        ignoreHTTPSErrors: true
    });
    return browser;
}

async function closeBrowser(browser) {
    console.log("browser closed");
    browser.close();
}

async function loadmore(page) {

    const buttons = await page.$$('.l4b0S');
    if (buttons[0] != undefined) {
        buttons[0].click();
    }

    if (postsAccumulator.length >= 24) {
        return true;
    } else {
        // loadmore(page);
    }
}

function responseCB(response) {
    const graphUrl = response.url();
    if (graphUrl.startsWith('https://www.instagram.com/graphql/query')) {
        console.log(graphUrl);
        response.json().then(doc => {
            payloadPostsAggregator = doc.data.user.edge_owner_to_timeline_media.edges;
            payloadPostsAggregator = payloadPostsAggregator.map(el => {
                var igAccount = new Object();
                igAccount.postId = el.node.id;
                igAccount.ownerId = el.node.owner.id;
                igAccount.authorUsername = el.node.owner.username;
                igAccount.postText = el.node.edge_media_to_caption.edges[0];
                igAccount.createdAt = el.node.taken_at_timestamp;
                igAccount.mediaShortCode = el.node.shortCode;
                igAccount.isVideo = el.node.is_video;
                igAccount.likes = el.node.edge_media_preview_like.count;
                igAccount.postURL = el.node.display_url;
                igAccount.comments = el.node.edge_media_to_comment.count;
                return igAccount;
            });
            postsAccumulator.push(...payloadPostsAggregator);
            payloadPostsAggregator = [];
        })
            .catch(err => {
                console.log("err ::==> " + err);
            })
    }
}

async function postScrapingEngine(account, browser, context) {

    const page = await context.newPage();
    try {
        await page.goto(`https://www.instagram.com/${account}`, { "waitUntil": "networkidle0" });
    } catch (error) {
        page.close();
        console.log("error while loading page" + error);
    }

    const recentPosts = await page.evaluate(() => {
        return window._sharedData.entry_data.ProfilePage[0].graphql.user.edge_owner_to_timeline_media.edges;
    }
    );

    var payloadPostsAggregator = [];
    //console.log(recentPosts.length);
    //recentPosts.map(el=>{console.log(el.node.shortcode)});
    postsAccumulator.push(...recentPosts);
    page.setRequestInterception(true);

    page.on('request', req => {
        var curUrl = req.url();

        if (curUrl.startsWith("https://www.instagram.com/graphql/query")) {

            curUrl = decodeURIComponent(curUrl);
            curUrl = curUrl.replace('"first":12', '"first":50');
            console.log("modified URL :: " + curUrl);
            req.continue({ url: curUrl, method: "GET" });
        } else {
            req.continue();
        }
    });

    //  page.on('response',responseCB);



    console.log("going to click on show more posts....");

    await loadmore(page);

    const response = await page.waitForResponse(response => response.url().startsWith("https://www.instagram.com/graphql/query") && response.status() === 200);

    const arr = await response.json().then(doc => {
        payloadPostsAggregator = doc.data.user.edge_owner_to_timeline_media.edges;
        payloadPostsAggregator = payloadPostsAggregator.map(el => {
            var igAccount = new Object();
            igAccount.postId = el.node.id;
            igAccount.ownerId = el.node.owner.id;
            igAccount.authorUsername = el.node.owner.username;
            igAccount.postText = el.node.edge_media_to_caption.edges[0];
            igAccount.createdAt = el.node.taken_at_timestamp;
            igAccount.mediaShortCode = el.node.shortCode;
            igAccount.isVideo = el.node.is_video;
            igAccount.likes = el.node.edge_media_preview_like.count;
            igAccount.postURL = el.node.display_url;
            igAccount.comments = el.node.edge_media_to_comment.count;
            return igAccount;
        });
        postsAccumulator.push(...payloadPostsAggregator);
        payloadPostsAggregator = [];
        return payloadPostsAggregator;
    })
        .catch(err => {
            console.log("err ::==> " + err);
        })



    console.log(postsAccumulator.length);
    return postsAccumulator;
}

async function init() {
    var browser = await startBrowser();
    const context = await browser.createIncognitoBrowserContext();
    await postScrapingEngine("net_ad", browser, context);

}

init();