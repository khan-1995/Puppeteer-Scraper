const puppeteer = require('puppeteer');
var write2File = require('../routes/testWrte').write2file;
var commentsAccumulator = [];
var csJson = new Object();
csJson["account_infotimelines"] = [];
csJson["account_comments"] = [];
var totalComments;
var ownerInfo;

var loadMore = async function (page,maxComments) {
    var loadMoreButton = await page.$('.glyphsSpriteCircle_add__outline__24__grey_9');
    if (loadMoreButton != null) {
        await page.waitFor(1000);
        await page.waitForSelector('button.dCJp8');
        await page.click('button.dCJp8');
        await page.waitFor(1000);
        isClickableLink = true;
        console.log("%c current count of comments agrregated :: " + commentsAccumulator.length, "color:green");
        if (commentsAccumulator.length > maxComments) {
            return false;
        }
        await loadMore(page,maxComments);
    } else {
        return false;
    }
};

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

async function commentScrapperEngine(shortCode, browser, context,maxComments) {

    //const browser = await startBrowser()
    const page = await context.newPage();
    try {
        await page.goto(`https://www.instagram.com/p/${shortCode}/`, { "waitUntil": "networkidle0" });
    } catch (error) {
         page.close();
         console.log("error while loading page"+error);
    }

    const commentObject = await page.evaluate(() => {
        return window._sharedData.entry_data.PostPage[0].graphql.shortcode_media;
    }
    );
    totalComments = commentObject.edge_media_to_parent_comment.count;
    ownerInfo = commentObject.owner;
    var mediaId = commentObject.id;
    var currentCommentsAggregator = [];
    var payloadCommentsAggregator = [];

    if (commentObject.edge_media_to_parent_comment != undefined
        && commentObject.edge_media_to_parent_comment.edges.length > 0) {
        currentCommentsAggregator = commentObject.edge_media_to_parent_comment.edges;
        currentCommentsAggregator = currentCommentsAggregator.map(el => {
            var commentedUser = new Object();
            commentedUser.commentId = el.node.id;
            commentedUser.author = el.node.owner.id;
            commentedUser.authorProfilePic = el.node.owner.profile_pic_url;
            commentedUser.authorUsername = el.node.owner.username;
            commentedUser.commentText = el.node.text;
            commentedUser.createdAt = el.node.created_at;
            commentedUser.mediaShortCode = shortCode;
            commentedUser.mediaId = mediaId;
            commentedUser.reactedUserName = ownerInfo.username;
            commentedUser.reactedUserId = ownerInfo.id;
            return commentedUser;
        });
    }
    commentsAccumulator.push(...currentCommentsAggregator);
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
    page.on('response', res => {
        const graphUrl = res.url();
        if (graphUrl.startsWith('https://www.instagram.com/graphql/query')) {
            console.log(graphUrl);
            res.json()
                .then(doc => {

                    payloadCommentsAggregator = doc.data.shortcode_media.edge_media_to_parent_comment.edges;
                    payloadCommentsAggregator = payloadCommentsAggregator.map(el => {
                        var commentedUser = new Object();
                        commentedUser.commentId = el.node.id;
                        commentedUser.author = el.node.owner.id;
                        commentedUser.authorProfilePic = el.node.owner.profile_pic_url;
                        commentedUser.authorUsername = el.node.owner.username;
                        commentedUser.commentText = el.node.text;
                        commentedUser.createdAt = el.node.created_at;
                        commentedUser.mediaShortCode = shortCode;
                        commentedUser.mediaId = mediaId;
                        commentedUser.reactedUserName = ownerInfo.username;
                        commentedUser.reactedUserId = ownerInfo.id;
                        return commentedUser;
                    });
                    commentsAccumulator.push(...payloadCommentsAggregator);
                    payloadCommentsAggregator = [];
                })
                .catch(err => {
                    console.log("err ::==> " + err);
                })
        }
    });

    if (totalComments > commentsAccumulator.length) {
        await loadMore(page,maxComments);
    }

    

    page.waitFor(1000);
    page.close();
    //csJson.account_comments.push(commentsAccumulator);
    //write2File(csJson);
    //browser.close();
    return commentsAccumulator;
}

async function getCommentsByPost(browser,context,mediaShortCode,maxComments) {
    if(browser===undefined && context===undefined){
        var browser = await startBrowser();
        const context = await browser.createIncognitoBrowserContext();
    }

   return await commentScrapperEngine(mediaShortCode, browser, context,maxComments);//
}

//getCommentsByPost();

exports.getCommentsByPost = getCommentsByPost;