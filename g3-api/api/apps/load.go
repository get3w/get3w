package apps

import (
	"net/http"
	"time"

	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/bairongsoft/get3w-utils/utils"
	"github.com/get3w/get3w/g3-api/pkg/api"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/storage"

	"github.com/labstack/echo"
)

// Load app
func Load(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	appDAO := dao.NewAppDAO()

	input := &get3w.AppLoadInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	if input.LastModified != "" {
		updatedAt, err := appDAO.GetUpdatedAt(owner, name)
		if err != nil {
			return api.ErrorInternal(c, err)
		}

		if input.LastModified == updatedAt {
			return c.String(http.StatusNotModified, "")
		}
	}

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
	parser.LoadSitesResources()

	if app.UpdatedAt == "" {
		app.UpdatedAt = timeutils.ToString(time.Now())
		appDAO.UpdateUpdatedAt(app.Owner, app.Name, app.UpdatedAt)
	}

	output := &get3w.AppLoadOutput{
		LastModified: app.UpdatedAt,
		App:          app,
		Config:       parser.Config,
		Sites:        parser.Sites,
	}
	return c.JSON(http.StatusOK, output)
}
