const puppeteer = require('puppeteer');
var write2File = require('../routes/fileops').write2file;
var commentsAccumulator = [];
var csJson = new Object();
csJson["account_infotimelines"] = [];
csJson["account_comments"] = [];

var loadMore = async function (page, maxComments,docHandle) {

        await page.waitFor(1000);
        const hasLoadMoreButton = await page.evaluateHandle(doc => {
            let commentLoadMoreButton = doc.getElementsByClassName('glyphsSpriteCircle_add__outline__24__grey_9 u-__7');
            if ( commentLoadMoreButton !== undefined && commentLoadMoreButton.length > 0 && commentLoadMoreButton[0]!==undefined) {
                commentLoadMoreButton[0].parentElement.click();
                return true;
            } 
            return false;
        }, docHandle);

        if(hasLoadMoreButton._remoteObject.value && commentsAccumulator.length<=maxComments){
            await page.waitFor(1000);
            await loadMore(page, maxComments, docHandle);
        }
        return false;
}

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

    async function commentScrapperEngine(shortCode, browser, context, maxComments) {

        const page = await context.newPage();
        try {
            await page.goto(`https://www.instagram.com/p/${shortCode}/`, { "waitUntil": "networkidle2", "timeout": 0 });
        } catch (error) {
            page.close();
            console.log("error while loading page" + error);
        }

        const commentObject = await page.evaluate(() => {
            return window._sharedData.entry_data.PostPage[0].graphql.shortcode_media;
        }
        );
        let totalComments = commentObject.edge_media_to_parent_comment.count;
        let ownerInfo = commentObject.owner;
        let mediaId = commentObject.id;
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
        await page.setRequestInterception(true);
        page.on('request', req => {
            var curUrl = req.url();

            if (curUrl.startsWith("https://www.instagram.com/graphql/query")) {
                curUrl = decodeURIComponent(curUrl);
                curUrl = curUrl.replace('"first":12', '"first":50');
                // console.log("modified URL :: " + curUrl);
                req.continue({ url: curUrl, method: "GET" });
            } else {
                req.continue();
            }
        });
        page.on('response', res => {
            const graphUrl = res.url();
            if (graphUrl.startsWith('https://www.instagram.com/graphql/query')) {
                console.log(` Total Aggregated Comments Count ${commentsAccumulator.length} Out Of ${totalComments} \n more comments loading....`);
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
            const doc = await page.evaluateHandle('document');
            await loadMore(page,maxComments,doc);
        }

        console.log(`\n MediaShortCode => ${shortCode}  TotalComments => ${totalComments}  CommentsFetched => ${commentsAccumulator.length} \n`);
        page.waitFor(1000 * 2);
        page.close();
        //csJson.account_comments.push(commentsAccumulator);
        //write2File(csJson);
        //browser.close();
        return commentsAccumulator;
    }

    async function getCommentsByPost(browser, context, mediaShortCodes, maxComments,allCommentsForAllPosts) {

        if (browser === undefined && context === undefined) {
            var browser = await startBrowser();
            var context = await browser.createIncognitoBrowserContext();
        }


        if (mediaShortCodes.length > 0) {
            commentsAccumulator = [];
            let currentPost = mediaShortCodes.shift();
            let comments = await commentScrapperEngine(currentPost, browser, context, maxComments);
            if (comments && comments.length > 0) {
                allCommentsForAllPosts.push(comments);
            }
            await getCommentsByPost(browser, context, mediaShortCodes, maxComments,allCommentsForAllPosts);
        }

        return allCommentsForAllPosts;

        // await closeBrowser(browser);
    }

   // getCommentsByPost(undefined, undefined, ["CFj9Y18Mejp"], 300);

    exports.getCommentsByPost = getCommentsByPost;