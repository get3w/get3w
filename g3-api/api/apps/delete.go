package apps

import (
	"net/http"

	"github.com/get3w/get3w/g3-api/pkg/api"
	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/bairongsoft/get3w-utils/utils"
	"github.com/get3w/get3w/storage"
	"github.com/labstack/echo"
)

// Delete app
func Delete(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	appDAO := dao.NewAppDAO()

	app, err := appDAO.GetApp(owner, name)
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

	parser.Storage.DeleteFolder(parser.Storage.GetSourcePrefix(""))
	appDAO.Delete(app.Owner, app.Name)

	return c.JSON(http.StatusOK, app)
}
