package files

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

// Delete file
func Delete(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")
	path := c.P(2)

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	appDAO := dao.NewAppDAO()
	app, err := appDAO.GetApp(owner, name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.Error(c, http.StatusNotFound, nil)
	}

	parser, err := storage.NewS3Parser(utils.BucketAppSource, utils.BucketAppDestination, app.Owner, app.Name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	parser.Storage.Delete(parser.Storage.GetSourceKey(path))

	lastModified := timeutils.ToString(time.Now())
	err = appDAO.UpdateUpdatedAt(app.Owner, app.Name, lastModified)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	output := &get3w.FileDeleteOutput{
		LastModified: lastModified,
	}
	return c.JSON(http.StatusOK, output)
}
