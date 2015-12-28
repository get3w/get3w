package folders

import (
	"net/http"
	"time"

	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/bairongsoft/get3w-utils/utils"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-api/api"

	"github.com/labstack/echo"
)

// Create create folder
func Create(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	appDAO := dao.NewAppDAO()

	input := &get3w.FolderCreateInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}
	if input.Path == "" {
		return api.ErrorBadRequest(c, nil)
	}

	app, err := appDAO.GetApp(owner, name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewS3Parser(utils.BucketAppSource, utils.BucketAppDestination, app.Owner, app.Name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	parser.Storage.NewFolder(parser.Storage.GetSourcePrefix(input.Path))
	lastModified := timeutils.ToString(time.Now())
	err = appDAO.UpdateUpdatedAt(app.Owner, app.Name, lastModified)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	output := &get3w.FolderCreateOutput{
		LastModified: lastModified,
	}
	return c.JSON(http.StatusOK, output)
}
