package apps

import (
	"fmt"
	"net/http"

	"github.com/get3w/get3w/g3-api/pkg/api"
	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/bairongsoft/get3w-utils/mq"
	"github.com/bairongsoft/get3w-utils/utils"
	"github.com/get3w/get3w/storage"
	"github.com/labstack/echo"
)

// Publish app
func Publish(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	app, err := dao.NewAppDAO().GetApp(owner, name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil || !api.IsSelf(c, app.Owner) {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewS3Parser(utils.BucketAppSource, utils.BucketAppDestination, app.Owner, app.Name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	parser.Build(true)

	for index, summary := range parser.Current.LinkSummaries {
		if index > 5 {
			break
		}
		pageAbsURL := utils.GetAppAbsURL(app.Owner, app.Name, summary.URL)
		pngRelatedURL := utils.GetPreviewPNGRelatedURL(app.Owner, app.Name, summary.URL)
		fmt.Println(pageAbsURL)
		fmt.Println(pngRelatedURL)
		mq.NewScreenshot(pageAbsURL, pngRelatedURL)
	}

	return c.String(http.StatusOK, "")
}
